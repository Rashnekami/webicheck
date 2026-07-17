import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeDocumentHash, generatePublicToken } from "@/lib/document-hash";

// Snapshot payload: everything needed to render the document publicly.
// Uses JsonValue-friendly types to satisfy TSS serializable-return validation.
type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { [k: string]: JsonValue } | JsonValue[];

export interface SnapshotPayload {
  tipo: "validacao_ont" | "instalacao";
  header: { [k: string]: JsonValue };
  dados: { [k: string]: JsonValue };
  tecnico: { full_name: string; assinatura: string | null };
  numero_publico: string | null;
  codigo_validacao: string | null;
  finalizado_em: string | null;
  created_at: string;
}

export interface PublicSnapshotView {
  status: "active" | "revoked" | "replaced" | "not_found";
  version: number | null;
  finalized_at: string | null;
  document_hash: string | null;
  short_hash: string | null;
  payload: SnapshotPayload | null;
  // Se a linha exibida foi substituída por uma revisão mais nova do mesmo case
  latest_public_token: string | null;
  latest_checklist_code: string | null;
  latest_revision_number: number | null;
}

export interface AdminSnapshotSummary {
  id: string;
  version: number;
  public_status: "active" | "revoked" | "replaced";
  public_token: string;
  document_hash: string;
  created_at: string;
  finalized_at: string;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  replaced_by_snapshot_id: string | null;
}

// -----------------------------------------------------------------
// Cria (ou reutiliza) o snapshot do checklist. Chamado após finalizar.
// -----------------------------------------------------------------
export const ensureChecklistSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId: string; forceNew?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autoriza: dono do checklist OU admin
    const { data: chk, error: chkErr } = await supabase
      .from("checklists")
      .select("*")
      .eq("id", data.checklistId)
      .maybeSingle();
    if (chkErr) throw new Error(chkErr.message);
    if (!chk) throw new Error("Checklist não encontrado.");
    if (chk.status !== "finalizado") throw new Error("Checklist não finalizado.");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (chk.tecnico_id !== userId && !isAdmin) {
      throw new Error("Sem permissão.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Se já existe snapshot ativo e não é forceNew, devolve o existente
    if (!data.forceNew) {
      const { data: existing } = await supabaseAdmin
        .from("checklist_document_snapshots")
        .select("id, version, public_token, public_status, document_hash")
        .eq("checklist_id", data.checklistId)
        .eq("public_status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return {
          id: existing.id,
          version: existing.version,
          public_token: existing.public_token,
          document_hash: existing.document_hash,
        };
      }
    }

    // Busca perfil do técnico (nome + assinatura) para embutir no snapshot
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name, assinatura")
      .eq("id", chk.tecnico_id)
      .maybeSingle();

    // Descobre próxima versão
    const { data: last } = await supabaseAdmin
      .from("checklist_document_snapshots")
      .select("id, version")
      .eq("checklist_id", data.checklistId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (last?.version ?? 0) + 1;

    const payload: SnapshotPayload = {
      tipo: (chk.tipo as SnapshotPayload["tipo"]) ?? "validacao_ont",
      header: {
        os: chk.os,
        cliente: chk.cliente,
        cidade: chk.cidade,
        endereco: chk.endereco,
        plano: chk.plano,
        modelo: chk.modelo,
        serial: chk.serial,
        cto_porta: chk.cto_porta,
        data_atendimento: chk.data_atendimento,
        hora_atendimento: chk.hora_atendimento,
        troca_realizada: chk.troca_realizada,
        modelo_ont_retirada: chk.modelo_ont_retirada,
        serial_ont_retirada: chk.serial_ont_retirada,
        modelo_ont_instalada: chk.modelo_ont_instalada,
        serial_ont_instalada: chk.serial_ont_instalada,
      },
      dados: (chk.dados as unknown as { [k: string]: JsonValue }) ?? {},
      tecnico: {
        full_name: (prof?.full_name as string | undefined) ?? "",
        assinatura: (prof?.assinatura as string | null | undefined) ?? null,
      },
      numero_publico: chk.numero_publico,
      codigo_validacao: chk.codigo_validacao,
      finalizado_em: chk.finalizado_em,
      created_at: new Date().toISOString(),
    };

    const document_hash = await computeDocumentHash(payload);
    const public_token = generatePublicToken(32);

    // Marca snapshot anterior ativo como replaced (se for forceNew)
    if (last && data.forceNew) {
      await supabaseAdmin
        .from("checklist_document_snapshots")
        .update({ public_status: "replaced" })
        .eq("id", last.id)
        .eq("public_status", "active");
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("checklist_document_snapshots")
      .insert({
        checklist_id: data.checklistId,
        version: nextVersion,
        public_token,
        public_status: "active",
        snapshot_data: payload as never,
        document_hash,
        finalized_at: chk.finalizado_em ?? new Date().toISOString(),
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Se forceNew, atualiza previous replaced_by
    if (last && data.forceNew) {
      await supabaseAdmin
        .from("checklist_document_snapshots")
        .update({ replaced_by_snapshot_id: inserted.id })
        .eq("id", last.id);
    }

    return { id: inserted.id, version: nextVersion, public_token, document_hash };
  });

// -----------------------------------------------------------------
// Busca o snapshot ativo do checklist (para o dono/admin ver token/QR).
// -----------------------------------------------------------------
export const getChecklistSnapshotSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId: string }) => d)
  .handler(async ({ data, context }): Promise<AdminSnapshotSummary | null> => {
    const { supabase } = context;
    const { data: snap, error } = await supabase
      .from("checklist_document_snapshots")
      .select(
        "id, version, public_status, public_token, document_hash, created_at, finalized_at, revoked_at, view_count, last_viewed_at, replaced_by_snapshot_id",
      )
      .eq("checklist_id", data.checklistId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!snap) return null;
    return snap as AdminSnapshotSummary;
  });

// -----------------------------------------------------------------
// Admin: revoga o snapshot ativo (link deixa de responder).
// -----------------------------------------------------------------
export const revokeChecklistSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { snapshotId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("checklist_document_snapshots")
      .update({
        public_status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("id", data.snapshotId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -----------------------------------------------------------------
// Admin: reativa um snapshot revogado (não substituído).
// -----------------------------------------------------------------
export const reactivateChecklistSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { snapshotId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("checklist_document_snapshots")
      .update({ public_status: "active", revoked_at: null, revoked_by: null })
      .eq("id", data.snapshotId)
      .neq("public_status", "replaced");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -----------------------------------------------------------------
// PÚBLICO: sem auth. Busca por token e devolve dados sanitizados.
// -----------------------------------------------------------------
export const getPublicChecklist = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<PublicSnapshotView> => {
    const empty: PublicSnapshotView = {
      status: "not_found",
      version: null,
      finalized_at: null,
      document_hash: null,
      short_hash: null,
      payload: null,
    };

    const token = (data.token ?? "").trim();
    if (!token || token.length < 20 || token.length > 128) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: snap } = await supabaseAdmin
      .from("checklist_document_snapshots")
      .select(
        "id, version, public_status, snapshot_data, document_hash, finalized_at, revoked_at",
      )
      .eq("public_token", token)
      .maybeSingle();

    if (!snap) return empty;

    // Registra o acesso (best-effort)
    try {
      const uaRaw = getRequestHeader("user-agent") ?? "";
      const referer = getRequestHeader("referer") ?? "";
      let refererDomain: string | null = null;
      try {
        if (referer) refererDomain = new URL(referer).hostname;
      } catch {
        refererDomain = null;
      }
      const ipRaw =
        getRequestHeader("cf-connecting-ip") ||
        getRequestHeader("x-forwarded-for")?.split(",")[0].trim() ||
        "";
      let ipHash: string | null = null;
      if (ipRaw) {
        const buf = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(ipRaw + "|webifibra"),
        );
        const b = new Uint8Array(buf);
        ipHash = "";
        for (let i = 0; i < 12; i++) ipHash += b[i].toString(16).padStart(2, "0");
      }
      await supabaseAdmin.from("checklist_public_access_logs").insert({
        snapshot_id: snap.id,
        event_type: "view",
        user_agent_summary: uaRaw.slice(0, 200),
        ip_hash: ipHash,
        referer_domain: refererDomain,
      });
    } catch (e) {
      console.warn("access log failed", e);
    }

    // Incremento simples de view_count (não atômico, best-effort)
    if (snap.public_status === "active") {
      try {
        const { data: cur } = await supabaseAdmin
          .from("checklist_document_snapshots")
          .select("view_count")
          .eq("id", snap.id)
          .single();
        await supabaseAdmin
          .from("checklist_document_snapshots")
          .update({
            view_count: (cur?.view_count ?? 0) + 1,
            last_viewed_at: new Date().toISOString(),
          })
          .eq("id", snap.id);
      } catch {
        // ignore
      }
    }

    const status = snap.public_status as "active" | "revoked" | "replaced";
    const shortHash = snap.document_hash.slice(0, 8).toUpperCase();

    if (status !== "active") {
      return {
        status,
        version: snap.version,
        finalized_at: snap.finalized_at,
        document_hash: snap.document_hash,
        short_hash: shortHash,
        payload: null,
      };
    }

    return {
      status: "active",
      version: snap.version,
      finalized_at: snap.finalized_at,
      document_hash: snap.document_hash,
      short_hash: shortHash,
      payload: snap.snapshot_data as unknown as SnapshotPayload,
    };
  });
