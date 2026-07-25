import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generatePublicToken } from "@/lib/document-hash";
import { formatChecklistCode } from "@/lib/checklist-code";

export type CounterproofStatus = "pending" | "opened" | "validated" | "annulled";
export type CounterproofSummary = {
  id: string; code: string; public_token?: string; status: CounterproofStatus;
  checklist_code: string; client_name: string | null; service_order: string | null;
  client_phone_e164: string | null; validated_at: string | null; created_at: string;
  signature_data_url?: string | null; identity_registered: boolean; annulment_reason?: string | null;
};
export type CounterproofLookup = CounterproofSummary | { unavailable: true };
export type CounterproofDocumentInfo = Pick<CounterproofSummary, "code" | "checklist_code" | "status" | "validated_at" | "identity_registered">;

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

export const getChecklistCounterproof = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId: string }) => d).handler(async ({ data, context }): Promise<CounterproofLookup | null> => {
    const { data: row, error } = await context.supabase.from("customer_counterproofs" as never).select("*").eq("checklist_id", data.checklistId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    // A tela técnica precisa continuar utilizável enquanto a migration ainda não
    // foi aplicada no ambiente de homologação.
    if (error && (error.code === "PGRST205" || error.message.includes("customer_counterproofs"))) {
      return { unavailable: true };
    }
    if (error) throw new Error(error.message); if (!row) return null;
    const r = row as any; return { ...r, identity_registered: !!r.identity_storage_path };
  });

export const createCustomerCounterproof = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { checklistId: string }) => d).handler(async ({ data, context }): Promise<CounterproofSummary> => {
    const { data: checklist, error } = await context.supabase.from("checklists").select("id, provider_id, case_id, tecnico_id, status, numero_publico, codigo_validacao, revision_number, cliente, os").eq("id", data.checklistId).single();
    if (error || !checklist) throw new Error("Checklist não encontrado.");
    if (checklist.status !== "finalizado") throw new Error("Finalize o checklist antes de gerar a Contra-Prova.");
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (checklist.tecnico_id !== context.userId && !admin) throw new Error("Sem permissão.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const db = supabaseAdmin as any;
    const { data: active } = await db.from("customer_counterproofs").select("*").eq("checklist_id", data.checklistId).in("status", ["pending", "opened", "validated"]).maybeSingle();
    if (active) return { ...active, identity_registered: !!active.identity_storage_path };
    const { data: inserted, error: insertError } = await db.from("customer_counterproofs").insert({ provider_id: checklist.provider_id, checklist_id: checklist.id, case_id: checklist.case_id, tecnico_id: checklist.tecnico_id, created_by: context.userId, public_token: generatePublicToken(32), checklist_code: formatChecklistCode(checklist), client_name: checklist.cliente, service_order: checklist.os }).select("*").single();
    if (insertError) throw new Error(insertError.message);
    await db.from("customer_counterproof_events").insert({ counterproof_id: inserted.id, event_type: "created", actor_type: admin ? "admin" : "technician", actor_user_id: context.userId, metadata: { checklist_code: inserted.checklist_code } });
    return { ...inserted, identity_registered: false };
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
  if (cp.status === "pending") await db.from("customer_counterproofs").update({ status: "opened", first_opened_at: new Date().toISOString() }).eq("id", cp.id);
  const meta = requestMeta(); await db.from("customer_counterproof_events").insert({ counterproof_id: cp.id, event_type: "opened", actor_type: "client", ip_address: meta.ip, user_agent: meta.ua });
  return { ...cp, status: cp.status === "pending" ? "opened" : cp.status, identity_registered: !!cp.identity_storage_path };
});

export const completePublicCounterproof = createServerFn({ method: "POST" }).inputValidator((d: { token: string; confirmed: boolean; identityImage: string; signature: string }) => d).handler(async ({ data }) => {
  if (!data.confirmed) throw new Error("Confirme as orientações para finalizar.");
  const identity = dataUrlBytes(data.identityImage); dataUrlBytes(data.signature);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const db = supabaseAdmin as any;
  const { data: cp } = await db.from("customer_counterproofs").select("*").eq("public_token", data.token.trim()).maybeSingle();
  if (!cp) throw new Error("Contra-Prova não encontrada."); if (cp.status === "validated" || cp.status === "annulled") throw new Error("Esta Contra-Prova não está disponível para alteração.");
  const path = `${cp.provider_id}/${cp.checklist_id}/${cp.id}/identificacao.${identity.mime.split("/")[1]}`;
  const { error: storageError } = await supabaseAdmin.storage.from("customer-counterproof-evidence").upload(path, identity.bytes, { contentType: identity.mime, upsert: false }); if (storageError) throw new Error("Não foi possível armazenar a evidência.");
  const meta = requestMeta(); const now = new Date().toISOString();
  const { error } = await db.from("customer_counterproofs").update({ status: "validated", identity_storage_path: path, identity_sha256: await sha256(identity.bytes), signature_data_url: data.signature, terms_version: "v1", validated_at: now, validated_ip: meta.ip, validated_user_agent: meta.ua }).eq("id", cp.id);
  if (error) throw new Error(error.message);
  await db.from("customer_counterproof_events").insert([{ counterproof_id: cp.id, event_type: "evidence_uploaded", actor_type: "client", ip_address: meta.ip, user_agent: meta.ua }, { counterproof_id: cp.id, event_type: "validated", actor_type: "client", ip_address: meta.ip, user_agent: meta.ua, metadata: { terms_version: "v1" } }]);
  return { code: cp.code, validated_at: now, checklist_code: cp.checklist_code };
});
