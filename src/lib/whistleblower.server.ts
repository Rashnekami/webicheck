// Canal Ético — lógica de servidor. Nunca importar em código de cliente.
import {
  WB_ALLOWED_MIME,
  WB_CATEGORIES,
  WB_MAX_FILES,
  WB_MAX_FILE_BYTES,
  WB_STATUS_LABEL,
  type PublicReportView,
  type ReportType,
  type WbStatus,
} from "@/lib/whistleblower";

export const WB_BUCKET = "whistleblower-evidence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = any;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChars(n: number) {
  const arr = new Uint32Array(n);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

export function generateProtocol() {
  return `DEN-${new Date().getFullYear()}-${randomChars(6)}`;
}

export function generateAccessKey() {
  return `${randomChars(4)}-${randomChars(4)}`;
}

export function generateValidationCode() {
  return `VAL-${randomChars(10)}`;
}

function toHex(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, "0");
  return hex;
}

export async function hashAccessKey(key: string, salt: string) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(key.toUpperCase()), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" },
    material,
    256,
  );
  return toHex(bits);
}

export function newSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashIdentifier(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`wb:${value}`));
  return toHex(buf).slice(0, 32);
}

export function sanitizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

export async function checkRateLimit(
  admin: AnyClient,
  bucket: string,
  action: string,
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await admin.rpc("consume_whistleblower_rate_limit", {
    _bucket: bucket,
    _action: action,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) return true; // não bloquear o canal por falha de infraestrutura
  return data !== false;
}

export async function resolveProvider(admin: AnyClient, host: string | undefined) {
  const sub = (host ?? "").split(":")[0].split(".")[0].toLowerCase();
  if (sub && !["www", "localhost", "checktecnico", "webicheck"].includes(sub)) {
    const { data } = await admin
      .from("providers")
      .select("id, name, slug")
      .eq("slug", sub)
      .eq("status", "active")
      .maybeSingle();
    if (data) return data as { id: string; name: string; slug: string };
  }
  const { data } = await admin
    .from("providers")
    .select("id, name, slug")
    .eq("slug", "webifibra")
    .maybeSingle();
  if (data) return data as { id: string; name: string; slug: string };
  const { data: first } = await admin
    .from("providers")
    .select("id, name, slug")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!first) throw new Error("Canal indisponível no momento.");
  return first as { id: string; name: string; slug: string };
}

export type IncomingFile = { name: string; mime: string; dataBase64: string };

function safeFileName(name: string) {
  const base = (name || "arquivo").split(/[\\/]/).pop() ?? "arquivo";
  return base.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "arquivo";
}

function base64ToBytes(b64: string) {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function storeAttachments(
  admin: AnyClient,
  reportId: string,
  files: IncomingFile[] | undefined,
  origin: "REPORTER" | "RH",
) {
  if (!files?.length) return [];
  if (files.length > WB_MAX_FILES) throw new Error(`Máximo de ${WB_MAX_FILES} arquivos por envio.`);
  const stored: string[] = [];
  for (const file of files) {
    if (!WB_ALLOWED_MIME.includes(file.mime)) throw new Error(`Formato não permitido: ${file.name}`);
    const bytes = base64ToBytes(file.dataBase64);
    if (bytes.byteLength > WB_MAX_FILE_BYTES) throw new Error(`Arquivo muito grande: ${file.name}`);
    if (bytes.byteLength === 0) continue;
    const display = safeFileName(file.name);
    const ext = display.includes(".") ? display.split(".").pop() : "bin";
    const path = `${reportId}/${crypto.randomUUID()}.${(ext ?? "bin").toLowerCase().slice(0, 8)}`;
    const { error: upErr } = await admin.storage.from(WB_BUCKET).upload(path, bytes, {
      contentType: file.mime,
      upsert: false,
    });
    if (upErr) throw new Error("Falha ao anexar evidência.");
    const { data, error } = await admin
      .from("whistleblower_attachments")
      .insert({
        report_id: reportId,
        storage_path: path,
        display_name: display,
        mime_type: file.mime,
        size_bytes: bytes.byteLength,
        origin,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    stored.push(data.id as string);
  }
  return stored;
}

export function categoryLabelFor(slug: string) {
  return WB_CATEGORIES.find((c) => c.slug === slug)?.label ?? "Outro";
}

export async function loadPublicView(admin: AnyClient, reportId: string): Promise<PublicReportView> {
  const [{ data: report }, { data: history }, { data: messages }, { data: attachments }] = await Promise.all([
    admin.from("whistleblower_reports").select("*").eq("id", reportId).single(),
    admin
      .from("whistleblower_status_history")
      .select("created_at, event_type, to_status, public_note, is_public")
      .eq("report_id", reportId)
      .eq("is_public", true)
      .order("created_at", { ascending: true }),
    admin
      .from("whistleblower_messages")
      .select("id, sender_type, message, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true }),
    admin
      .from("whistleblower_attachments")
      .select("id, display_name, created_at, origin")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    protocol: report.protocol,
    categoryLabel: report.category_label,
    title: report.title,
    description: report.description,
    reportType: report.report_type as ReportType,
    status: report.status as WbStatus,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    closedAt: report.closed_at,
    unit: report.unit,
    city: report.city,
    department: report.department,
    locationDescription: report.location_description,
    incidentDate: report.incident_date,
    incidentTime: report.incident_time,
    peopleInvolved: report.people_involved,
    witnesses: report.witnesses,
    frequency: report.frequency,
    validationCode: report.validation_code,
    timeline: (history ?? []).map((h: any) => ({
      at: h.created_at,
      label:
        h.public_note ??
        (h.to_status ? `Status atualizado para ${WB_STATUS_LABEL[h.to_status as WbStatus]}` : h.event_type),
    })),
    messages: (messages ?? []).map((m: any) => ({
      id: m.id,
      sender: m.sender_type,
      message: m.message,
      at: m.created_at,
    })),
    attachments: (attachments ?? []).map((a: any) => ({
      id: a.id,
      name: a.display_name,
      at: a.created_at,
      origin: a.origin,
    })),
  };
}

export async function authenticateReport(admin: AnyClient, protocol: string, accessKey: string) {
  const { data: report } = await admin
    .from("whistleblower_reports")
    .select("id, access_key_hash, access_key_salt")
    .eq("protocol", protocol.trim().toUpperCase())
    .maybeSingle();
  if (!report) throw new Error("Protocolo ou chave de acesso inválidos.");
  const hash = await hashAccessKey(accessKey.trim().toUpperCase(), report.access_key_salt);
  if (!safeEqual(hash, report.access_key_hash)) throw new Error("Protocolo ou chave de acesso inválidos.");
  return report.id as string;
}
