import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonPrim = string | number | boolean | null;
type JsonVal = JsonPrim | { [k: string]: JsonVal } | JsonVal[];

// ---------------- Tipos ----------------
export type ServiceStage =
  | "initial"
  | "pre_change"
  | "post_ont_change"
  | "noc_retest"
  | "additional_test";

export type TestStage =
  | "before_change"
  | "after_ont_change"
  | "noc_retest"
  | "additional_test";

export interface DiagnosticReportRow {
  id: string;
  checklist_id: string;
  case_id: string;
  diagnostic_session_id: string;
  original_filename: string;
  storage_path: string;
  sha256: string;
  size_bytes: number;
  mime_type: string;
  agent_version: string | null;
  generated_at: string | null;
  test_stage: TestStage;
  report_sequence: number;
  status: "active" | "revoked" | "replaced";
  created_at: string;
  metadata: { [k: string]: JsonVal };
}

export interface IntegrationTokenRow {
  id: string;
  name: string;
  token_prefix: string;
  active: boolean;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

// ---------------- Utilidades ----------------
async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const buf =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++)
    out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function randomTokenValue(prefix = "wdk_"): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(bin, "binary").toString("base64");
  return (
    prefix +
    b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  );
}

// ---------------- Revisão de checklist ----------------
// Etapas válidas SOMENTE para revisões (revision_number > 1).
// 'initial' é reservado ao primeiro checklist do caso.
const REVISION_ONLY_STAGES = [
  "pre_change",
  "post_ont_change",
  "noc_retest",
  "additional_test",
] as const;
type RevisionStage = (typeof REVISION_ONLY_STAGES)[number];

export const createChecklistRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      checklistId: string;
      reason: string;
      stage: RevisionStage;
      notes?: string | null;
    }) => {
      if (!d.checklistId) throw new Error("checklistId obrigatório.");
      if (!d.reason || d.reason.trim().length < 3)
        throw new Error("Informe o motivo da revisão.");
      if (!REVISION_ONLY_STAGES.includes(d.stage))
        throw new Error(
          "Etapa inválida para revisão. Use pré-troca, pós-troca, reteste NOC ou teste adicional.",
        );
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Toda a lógica (propriedade, próximo número, unset is_current, insert shell,
    // superseded_by do pai) é executada atomicamente pela RPC transacional.
    const { data: row, error } = await supabase.rpc(
      "create_checklist_revision",
      {
        _parent_id: data.checklistId,
        _reason: data.reason.trim(),
        _stage: data.stage,
        _notes: data.notes?.trim() || undefined,
      },
    );
    if (error) {
      const msg = error.message || "";
      if (msg.includes("forbidden"))
        throw new Error("Sem permissão para revisar este checklist.");
      if (msg.includes("parent_not_finalized"))
        throw new Error("Só é possível revisar checklists finalizados.");
      if (msg.includes("invalid_stage_for_revision"))
        throw new Error("Etapa inválida para revisão.");
      if (msg.includes("checklist_not_found"))
        throw new Error("Checklist não encontrado.");
      if (msg.includes("uq_checklists_case_revision"))
        throw new Error(
          "Já existe uma revisão em andamento para este atendimento.",
        );
      throw new Error(msg);
    }
    const first = Array.isArray(row) ? row[0] : row;
    if (!first) throw new Error("Falha ao criar revisão.");
    return {
      id: first.id as string,
      revision_number: first.revision_number as number,
    };
  });


// ---------------- Diagnósticos ----------------
export const listDiagnosticReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId?: string; caseId?: string }) => d)
  .handler(async ({ data, context }): Promise<DiagnosticReportRow[]> => {
    const { supabase } = context;
    let q = supabase
      .from("checklist_diagnostic_reports")
      .select(
        "id, checklist_id, case_id, diagnostic_session_id, original_filename, storage_path, sha256, size_bytes, mime_type, agent_version, generated_at, test_stage, report_sequence, status, created_at, metadata",
      )
      .order("created_at", { ascending: true });
    if (data.checklistId) q = q.eq("checklist_id", data.checklistId);
    if (data.caseId) q = q.eq("case_id", data.caseId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as DiagnosticReportRow[];
  });

export const getDiagnosticDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reportId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("checklist_diagnostic_reports")
      .select("storage_path")
      .eq("id", data.reportId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Diagnóstico não encontrado.");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("webi-diagnostic-reports")
      .createSignedUrl(row.storage_path, 300);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl };
  });

export const revokeDiagnosticReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reportId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores.");
    const { data: rep, error } = await supabase
      .from("checklist_diagnostic_reports")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: userId,
      })
      .eq("id", data.reportId)
      .select("checklist_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (rep?.checklist_id) {
      try {
        const { regenerateChecklistSnapshot } = await import(
          "@/lib/snapshot-service.server"
        );
        await regenerateChecklistSnapshot(rep.checklist_id);
      } catch (e) {
        console.warn("snapshot_regenerate_failed", e);
      }
    }
    return { ok: true };
  });

// ---------------- Timeline do atendimento ----------------
export interface CaseTimelineItem {
  kind: "revision" | "diagnostic";
  at: string;
  id: string;
  label: string;
  meta: { [k: string]: JsonVal };
}

export const listCaseTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => d)
  .handler(async ({ data, context }): Promise<CaseTimelineItem[]> => {
    const { supabase } = context;
    const [{ data: revs }, { data: diags }] = await Promise.all([
      supabase
        .from("checklists")
        .select(
          "id, revision_number, service_stage, revision_reason, created_at, revised_at, finalizado_em, status, numero_publico, codigo_validacao, is_current",
        )
        .eq("case_id", data.caseId)
        .order("revision_number", { ascending: true }),
      supabase
        .from("checklist_diagnostic_reports")
        .select(
          "id, test_stage, report_sequence, created_at, original_filename, agent_version, status",
        )
        .eq("case_id", data.caseId)
        .order("created_at", { ascending: true }),
    ]);
    const out: CaseTimelineItem[] = [];
    (revs ?? []).forEach((r) =>
      out.push({
        kind: "revision",
        at: r.revised_at ?? r.created_at,
        id: r.id,
        label: `Revisão R${r.revision_number} — ${r.service_stage}`,
        meta: r as unknown as { [k: string]: JsonVal },
      }),
    );
    (diags ?? []).forEach((d) =>
      out.push({
        kind: "diagnostic",
        at: d.created_at,
        id: d.id,
        label: `Diagnóstico ${d.test_stage} #${d.report_sequence}`,
        meta: d as unknown as { [k: string]: JsonVal },
      }),
    );
    out.sort((a, b) => a.at.localeCompare(b.at));
    return out;
  });

// ---------------- Tokens de integração ----------------
export const listIntegrationTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationTokenRow[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("webi_integration_tokens")
      .select(
        "id, name, token_prefix, active, scopes, expires_at, last_used_at, created_at, revoked_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as IntegrationTokenRow[];
  });

export const createIntegrationToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => {
    if (!d.name || d.name.trim().length < 2)
      throw new Error("Dê um nome ao token (ex: Notebook João).");
    if (d.name.length > 60) throw new Error("Nome muito longo.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const value = randomTokenValue("wdk_");
    const token_hash = await sha256Hex(value);
    const token_prefix = value.slice(0, 10);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: inserted, error } = await supabaseAdmin
      .from("webi_integration_tokens")
      .insert({
        user_id: userId,
        name: data.name.trim(),
        token_prefix,
        token_hash,
      } as never)
      .select("id, name, token_prefix, active, created_at")
      .single();
    if (error) throw new Error(error.message);
    // valor completo devolvido UMA vez
    return { ...inserted, token_value: value };
  });

export const revokeIntegrationToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tokenId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("webi_integration_tokens")
      .update({
        active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq("id", data.tokenId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
