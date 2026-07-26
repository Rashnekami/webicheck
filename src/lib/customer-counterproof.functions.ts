import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePublicToken } from "@/lib/document-hash";
import { formatChecklistCode } from "@/lib/checklist-code";
import {
  normalizeCustomerCounterproofChecklist,
  type CustomerCounterproofChecklist,
} from "@/lib/customer-counterproof-checklist";

export type CounterproofStatus = "pending" | "opened" | "validated" | "annulled";
export type CounterproofSummary = {
  id: string; code: string; public_token?: string; status: CounterproofStatus;
  checklist_code: string; client_name: string | null; service_order: string | null;
  client_phone_e164: string | null; validated_at: string | null; created_at: string;
  signature_data_url?: string | null; identity_registered: boolean; annulment_reason?: string | null;
  client_checklist_version?: string | null;
  client_checklist?: CustomerCounterproofChecklist | null;
  admin_identity_reviewed_at?: string | null;
  city?: string | null;
  validation_code?: string | null;
  attendance_date?: string | null;
  attendance_time?: string | null;
};
export type CounterproofLookup = CounterproofSummary | { unavailable: true };
export type CounterproofDocumentInfo = Pick<
  CounterproofSummary,
  | "code"
  | "checklist_code"
  | "status"
  | "validated_at"
  | "identity_registered"
  | "client_name"
  | "service_order"
  | "signature_data_url"
  | "client_checklist_version"
  | "client_checklist"
  | "city"
  | "validation_code"
  | "attendance_date"
  | "attendance_time"
>;

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55")) throw new Error("Informe somente DDD + número, sem 55.");
  if (!/^\d{10,11}$/.test(digits) || Number(digits.slice(0, 2)) < 11) throw new Error("Informe um telefone válido com DDD + número.");
  return `55${digits}`;
}
function requestMeta() {
  return { ip: getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || null, ua: (getRequestHeader("user-agent") || "").slice(0, 500) || null };
}
function dataUrlBytes(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Imagem inválida.");
  const binary = atob(match[2]);
  if (binary.length > 8 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 8 MB.");
  return { mime: match[1], bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)) };
}
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function counterproofSummary(
  row: any,
  includeSignature = false,
  adminIdentityReviewedAt: string | null = null,
  checklist?: {
    cidade?: string | null;
    codigo_validacao?: string | null;
    data_atendimento?: string | null;
    hora_atendimento?: string | null;
  } | null,
): CounterproofSummary {
  return {
    id: row.id,
    code: row.code,
    public_token: row.public_token,
    status: row.status,
    checklist_code: row.checklist_code,
    client_name: row.client_name ?? null,
    service_order: row.service_order ?? null,
    client_phone_e164: row.client_phone_e164 ?? null,
    validated_at: row.validated_at ?? null,
    created_at: row.created_at,
    signature_data_url: includeSignature ? row.signature_data_url ?? null : undefined,
    identity_registered: Boolean(row.identity_storage_path),
    annulment_reason: row.annulment_reason ?? null,
    client_checklist_version: row.client_checklist_version ?? null,
    client_checklist: row.client_checklist ?? null,
    admin_identity_reviewed_at: adminIdentityReviewedAt,
    city: checklist?.cidade ?? null,
    validation_code: checklist?.codigo_validacao ?? null,
    attendance_date: checklist?.data_atendimento ?? null,
    attendance_time: checklist?.hora_atendimento ?? null,
  };
}

export const getChecklistCounterproof = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId: string }) => d).handler(async ({ data, context }): Promise<CounterproofLookup | null> => {
    const { data: row, error } = await context.supabase.from("customer_counterproofs" as never).select("*").eq("checklist_id", data.checklistId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    // A tela técnica precisa continuar utilizável enquanto a migration ainda não
    // foi aplicada no ambiente de homologação.
    if (error && (error.code === "PGRST205" || error.message.includes("customer_counterproofs"))) {
      return { unavailable: true };
    }
    if (error) throw new Error(error.message); if (!row) return null;
    const [{ data: adminReview }, { data: checklist }] = await Promise.all([
      context.supabase
        .from("customer_counterproof_events" as never)
        .select("created_at")
        .eq("counterproof_id", (row as any).id)
        .eq("event_type", "validated")
        .eq("actor_type", "admin")
        .contains("metadata", { resource: "identity_evidence_review" })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from("checklists")
        .select("cidade, codigo_validacao, data_atendimento, hora_atendimento")
        .eq("id", data.checklistId)
        .maybeSingle(),
    ]);
    return counterproofSummary(
      row as any,
      true,
      (adminReview as any)?.created_at ?? null,
      checklist,
    );
  });

export const createCustomerCounterproof = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId: string }) => d).handler(async ({ data, context }): Promise<CounterproofSummary> => {
    const { data: checklist, error } = await context.supabase.from("checklists").select("id, provider_id, case_id, tecnico_id, status, numero_publico, codigo_validacao, revision_number, cliente, os, cidade, data_atendimento, hora_atendimento").eq("id", data.checklistId).single();
    if (error || !checklist) throw new Error("Checklist não encontrado.");
    if (checklist.status !== "finalizado") throw new Error("Finalize o checklist antes de gerar a Contra-Prova.");
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (checklist.tecnico_id !== context.userId && !admin) throw new Error("Sem permissão.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const db = supabaseAdmin as any;
    const { data: active } = await db.from("customer_counterproofs").select("*").eq("checklist_id", data.checklistId).in("status", ["pending", "opened", "validated"]).maybeSingle();
    if (active) return counterproofSummary(active, true, null, checklist);
    const { data: inserted, error: insertError } = await db.from("customer_counterproofs").insert({ provider_id: checklist.provider_id, checklist_id: checklist.id, case_id: checklist.case_id, tecnico_id: checklist.tecnico_id, created_by: context.userId, public_token: generatePublicToken(32), checklist_code: formatChecklistCode(checklist), client_name: checklist.cliente, service_order: checklist.os }).select("*").single();
    if (insertError) throw new Error(insertError.message);
    await db.from("customer_counterproof_events").insert({ counterproof_id: inserted.id, event_type: "created", actor_type: admin ? "admin" : "technician", actor_user_id: context.userId, metadata: { checklist_code: inserted.checklist_code } });
    return counterproofSummary(inserted, true, null, checklist);
  });

export const registerCounterproofPhone = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { counterproofId: string; phone: string; whatsappOpened?: boolean }) => d).handler(async ({ data, context }) => {
    const phone = normalizePhone(data.phone); const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const db = supabaseAdmin as any;
    const { data: cp } = await db.from("customer_counterproofs").select("*").eq("id", data.counterproofId).single();
    if (!cp || (cp.tecnico_id !== context.userId && !(await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" })).data)) throw new Error("Sem permissão.");
    if (cp.status === "validated" || cp.status === "annulled") throw new Error("Contra-Prova não pode mais ser alterada.");
    await db.from("customer_counterproofs").update({ client_phone_e164: phone }).eq("id", cp.id);
    await db.from("customer_counterproof_events").insert({ counterproof_id: cp.id, event_type: data.whatsappOpened ? "whatsapp_opened" : "phone_registered", actor_type: "technician", actor_user_id: context.userId, metadata: { phone } });
    return { phone };
  });

export const getPublicCounterproof = createServerFn({ method: "POST" }).inputValidator((d: { token: string }) => d).handler(async ({ data }): Promise<CounterproofSummary | null> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const db = supabaseAdmin as any;
  const { data: cp } = await db.from("customer_counterproofs").select("*").eq("public_token", data.token.trim()).maybeSingle(); if (!cp) return null;
  const { data: checklist } = await db
    .from("checklists")
    .select("cidade, codigo_validacao, data_atendimento, hora_atendimento")
    .eq("id", cp.checklist_id)
    .maybeSingle();
  if (cp.status === "pending") await db.from("customer_counterproofs").update({ status: "opened", first_opened_at: new Date().toISOString() }).eq("id", cp.id);
  const meta = requestMeta(); await db.from("customer_counterproof_events").insert({ counterproof_id: cp.id, event_type: "opened", actor_type: "client", ip_address: meta.ip, user_agent: meta.ua });
  return counterproofSummary(
    { ...cp, status: cp.status === "pending" ? "opened" : cp.status },
    false,
    null,
    checklist,
  );
});

export const completePublicCounterproof = createServerFn({ method: "POST" }).inputValidator((d: {
  token: string;
  confirmed: boolean;
  identityImage: string;
  signature: string;
  clientChecklist: CustomerCounterproofChecklist;
}) => d).handler(async ({ data }) => {
  if (!data.confirmed) throw new Error("Confirme as orientações para finalizar.");
  const clientChecklist = normalizeCustomerCounterproofChecklist(data.clientChecklist);
  const identity = dataUrlBytes(data.identityImage); dataUrlBytes(data.signature);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const db = supabaseAdmin as any;
  const { data: cp } = await db.from("customer_counterproofs").select("*").eq("public_token", data.token.trim()).maybeSingle();
  if (!cp) throw new Error("Contra-Prova não encontrada."); if (cp.status === "validated" || cp.status === "annulled") throw new Error("Esta Contra-Prova não está disponível para alteração.");
  const path = `${cp.provider_id}/${cp.checklist_id}/${cp.id}/identificacao.${identity.mime.split("/")[1]}`;
  const { error: storageError } = await supabaseAdmin.storage.from("customer-counterproof-evidence").upload(path, identity.bytes, { contentType: identity.mime, upsert: false }); if (storageError) throw new Error("Não foi possível armazenar a evidência.");
  const meta = requestMeta(); const now = new Date().toISOString();
  const { error } = await db.from("customer_counterproofs").update({
    status: "validated",
    identity_storage_path: path,
    identity_sha256: await sha256(identity.bytes),
    signature_data_url: data.signature,
    client_checklist_version: clientChecklist.version,
    client_checklist: clientChecklist,
    terms_version: "v1",
    validated_at: now,
    validated_ip: meta.ip,
    validated_user_agent: meta.ua,
  }).eq("id", cp.id);
  if (error) throw new Error(error.message);
  await db.from("customer_counterproof_events").insert([
    {
      counterproof_id: cp.id,
      event_type: "evidence_uploaded",
      actor_type: "client",
      ip_address: meta.ip,
      user_agent: meta.ua,
    },
    {
      counterproof_id: cp.id,
      event_type: "validated",
      actor_type: "client",
      ip_address: meta.ip,
      user_agent: meta.ua,
      metadata: {
        terms_version: "v1",
        client_checklist_version: clientChecklist.version,
        answers_count: clientChecklist.items.length,
      },
    },
  ]);
  return { code: cp.code, validated_at: now, checklist_code: cp.checklist_code };
});

export const getCounterproofEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { counterproofId: string }) => d)
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: profile }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase
        .from("profiles")
        .select("provider_id, platform_admin")
        .eq("id", context.userId)
        .single(),
    ]);
    if (!isAdmin || !profile) throw new Error("Somente administradores podem ver esta evidência.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: cp } = await db
      .from("customer_counterproofs")
      .select("id, provider_id, identity_storage_path")
      .eq("id", data.counterproofId)
      .single();
    if (!cp?.identity_storage_path) throw new Error("Evidência de identificação não encontrada.");
    if (!profile.platform_admin && cp.provider_id !== profile.provider_id) {
      throw new Error("Sem permissão para acessar esta evidência.");
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("customer-counterproof-evidence")
      .createSignedUrl(cp.identity_storage_path, 300);
    if (error || !signed?.signedUrl) throw new Error("Não foi possível abrir a evidência.");

    const meta = requestMeta();
    await db.from("customer_counterproof_events").insert({
      counterproof_id: cp.id,
      event_type: "opened",
      actor_type: "admin",
      actor_user_id: context.userId,
      ip_address: meta.ip,
      user_agent: meta.ua,
      metadata: { resource: "identity_evidence", expires_in_seconds: 300 },
    });

    return { url: signed.signedUrl, expiresInSeconds: 300 };
  });

export const confirmCounterproofEvidenceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { counterproofId: string }) => d)
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: profile }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase
        .from("profiles")
        .select("provider_id, platform_admin")
        .eq("id", context.userId)
        .single(),
    ]);
    if (!isAdmin || !profile) throw new Error("Somente administradores podem confirmar a conferência.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: cp } = await db
      .from("customer_counterproofs")
      .select("id, provider_id, status, identity_storage_path")
      .eq("id", data.counterproofId)
      .single();
    if (!cp || cp.status !== "validated" || !cp.identity_storage_path) {
      throw new Error("Contra-Prova validada com evidência não encontrada.");
    }
    if (!profile.platform_admin && cp.provider_id !== profile.provider_id) {
      throw new Error("Sem permissão para conferir esta evidência.");
    }

    const { data: previous } = await db
      .from("customer_counterproof_events")
      .select("created_at")
      .eq("counterproof_id", cp.id)
      .eq("event_type", "validated")
      .eq("actor_type", "admin")
      .contains("metadata", { resource: "identity_evidence_review" })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous) return { reviewedAt: previous.created_at };

    const meta = requestMeta();
    const { data: event, error } = await db
      .from("customer_counterproof_events")
      .insert({
        counterproof_id: cp.id,
        event_type: "validated",
        actor_type: "admin",
        actor_user_id: context.userId,
        ip_address: meta.ip,
        user_agent: meta.ua,
        metadata: { resource: "identity_evidence_review" },
      })
      .select("created_at")
      .single();
    if (error || !event) throw new Error("Não foi possível registrar a conferência.");
    return { reviewedAt: event.created_at };
  });
