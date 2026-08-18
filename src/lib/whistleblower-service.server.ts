// Canal Ético — serviços públicos (sem autenticação). Só acessa o banco
// depois de validar protocolo + chave; nunca grava identificadores do
// denunciante anônimo.
import {
  authenticateReport,
  categoryLabelFor,
  checkRateLimit,
  generateAccessKey,
  generateProtocol,
  generateValidationCode,
  hashAccessKey,
  hashIdentifier,
  loadPublicView,
  newSalt,
  resolveProvider,
  sanitizeText,
  storeAttachments,
  WB_BUCKET,
  type IncomingFile,
} from "@/lib/whistleblower.server";
import type { SubmitReportInput } from "@/lib/whistleblower-public.functions";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function submitReport(input: SubmitReportInput, ctx: { host?: string; ip?: string }) {
  const db = await admin();
  const bucket = await hashIdentifier(ctx.ip || "anon");
  const allowed = await checkRateLimit(db, bucket, "submit", 5, 3600);
  if (!allowed) throw new Error("Muitos envios em pouco tempo. Tente novamente mais tarde.");

  const title = sanitizeText(input.title, 200);
  const description = sanitizeText(input.description, 20000);
  if (!title || title.length < 5) throw new Error("Informe um título com pelo menos 5 caracteres.");
  if (!description || description.length < 20)
    throw new Error("Descreva o ocorrido com pelo menos 20 caracteres.");

  const provider = await resolveProvider(db, ctx.host);
  const isAnonymous = input.reportType !== "IDENTIFIED";
  const protocol = generateProtocol();
  const accessKey = generateAccessKey();
  const salt = newSalt();
  const accessKeyHash = await hashAccessKey(accessKey, salt);

  const row: Record<string, unknown> = {
    provider_id: provider.id,
    protocol,
    access_key_hash: accessKeyHash,
    access_key_salt: salt,
    validation_code: generateValidationCode(),
    report_type: isAnonymous ? "ANONYMOUS" : "IDENTIFIED",
    category_slug: input.categorySlug,
    category_label: categoryLabelFor(input.categorySlug),
    title,
    description,
    unit: sanitizeText(input.unit, 120),
    city: sanitizeText(input.city, 120),
    department: sanitizeText(input.department, 120),
    location_description: sanitizeText(input.locationDescription, 300),
    incident_date: input.incidentDate || null,
    incident_time: sanitizeText(input.incidentTime, 20),
    people_involved: sanitizeText(input.peopleInvolved, 1000),
    witnesses: sanitizeText(input.witnesses, 1000),
    frequency: sanitizeText(input.frequency, 120),
    status: "RECEBIDA",
  };
  if (!isAnonymous) {
    row.identified_name = sanitizeText(input.identifiedName, 160);
    row.identified_email = sanitizeText(input.identifiedEmail, 160);
    row.identified_phone = sanitizeText(input.identifiedPhone, 40);
    row.identified_department = sanitizeText(input.identifiedDepartment, 120);
  }

  const { data: report, error } = await db
    .from("whistleblower_reports")
    .insert(row)
    .select("id, protocol, validation_code, created_at")
    .single();
  if (error) throw new Error("Não foi possível registrar a denúncia agora.");

  try {
    await storeAttachments(db, report.id, input.files as IncomingFile[] | undefined, "REPORTER");
  } catch (e) {
    // Mantém a denúncia registrada mesmo se um anexo falhar.
    await db.from("whistleblower_status_history").insert({
      report_id: report.id,
      event_type: "attachment_error",
      internal_note: (e as Error).message,
      is_public: false,
    });
  }

  await db.from("whistleblower_status_history").insert({
    report_id: report.id,
    event_type: "created",
    to_status: "RECEBIDA",
    public_note: "Denúncia recebida",
    is_public: true,
  });

  return {
    protocol: report.protocol,
    accessKey,
    validationCode: report.validation_code,
    createdAt: report.created_at,
  };
}

export async function trackReport(input: { protocol: string; accessKey: string }, ctx: { ip?: string }) {
  const db = await admin();
  const bucket = await hashIdentifier(ctx.ip || "anon");
  const allowed = await checkRateLimit(db, bucket, "track", 15, 600);
  if (!allowed) throw new Error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  const id = await authenticateReport(db, input.protocol, input.accessKey);
  return loadPublicView(db, id);
}

export async function reporterUpdate(input: {
  protocol: string;
  accessKey: string;
  message?: string;
  files?: IncomingFile[];
}) {
  const db = await admin();
  const id = await authenticateReport(db, input.protocol, input.accessKey);
  const message = sanitizeText(input.message, 5000);
  if (!message && !input.files?.length) throw new Error("Escreva uma mensagem ou anexe uma evidência.");

  if (input.files?.length) {
    await storeAttachments(db, id, input.files, "REPORTER");
    await db.from("whistleblower_status_history").insert({
      report_id: id,
      event_type: "attachment",
      public_note: "Nova evidência enviada pelo denunciante",
      is_public: true,
    });
  }
  if (message) {
    await db.from("whistleblower_messages").insert({ report_id: id, sender_type: "REPORTER", message });
  }
  return loadPublicView(db, id);
}

export async function reporterAttachmentUrl(input: {
  protocol: string;
  accessKey: string;
  attachmentId: string;
}) {
  const db = await admin();
  const id = await authenticateReport(db, input.protocol, input.accessKey);
  const { data: att } = await db
    .from("whistleblower_attachments")
    .select("storage_path, report_id")
    .eq("id", input.attachmentId)
    .maybeSingle();
  if (!att || att.report_id !== id) throw new Error("Evidência não encontrada.");
  const { data } = await db.storage.from(WB_BUCKET).createSignedUrl(att.storage_path, 300);
  if (!data?.signedUrl) throw new Error("Não foi possível abrir a evidência.");
  return { url: data.signedUrl as string };
}

export async function validateDocument(code: string) {
  const db = await admin();
  const clean = (code || "").trim().toUpperCase().slice(0, 40);
  const { data } = await db
    .from("whistleblower_reports")
    .select("protocol, created_at, updated_at")
    .eq("validation_code", clean)
    .maybeSingle();
  if (!data) return { valid: false as const };
  return {
    valid: true as const,
    protocol: data.protocol as string,
    issuedAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    validationCode: clean,
  };
}
