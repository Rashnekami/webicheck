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

/**
 * Identificador derivado para rate limit. Usa HMAC com segredo de servidor:
 * um SHA-256 puro de IP é reversível por força bruta do espaço IPv4 inteiro em
 * segundos, o que permitiria correlacionar a janela de rate limit com o
 * created_at da denúncia e descobrir o IP de um denunciante anônimo.
 */
export async function hashIdentifier(value: string) {
  const secret =
    process.env.WHISTLEBLOWER_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(`wb:${value}`));
  return toHex(buf).slice(0, 32);
}

export function sanitizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

/**
 * @param failOpen true para o envio de denúncia (uma falha de infraestrutura
 * nunca pode impedir alguém de denunciar). false para endpoints que validam
 * chave de acesso, onde falhar aberto liberaria força bruta sem teto.
 */
export async function checkRateLimit(
  admin: AnyClient,
  bucket: string,
  action: string,
  limit: number,
  windowSeconds: number,
  failOpen = false,
) {
  const { data, error } = await admin.rpc("consume_whistleblower_rate_limit", {
    _bucket: bucket,
    _action: action,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) return failOpen;
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

/**
 * Assinaturas reais dos formatos aceitos. O MIME que chega na requisição é
 * declarado pelo cliente e não prova nada: sem esta checagem é possível subir
 * um executável dizendo que é PDF, e o RH baixaria o arquivo confiando no tipo.
 */
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "application/pdf": (b) =>
    b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  "audio/mpeg": (b) =>
    (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
    (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  "audio/wav": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46,
  "audio/ogg": (b) =>
    b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53,
  // ISO-BMFF (mp4/m4a/mov): "ftyp" no offset 4.
  "audio/mp4": isFtyp,
  "video/mp4": isFtyp,
  "video/quicktime": isFtyp,
  // Matroska/WebM.
  "audio/webm": isEbml,
  "video/webm": isEbml,
  // ZIP (OOXML .docx).
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b) =>
    b[0] === 0x50 && b[1] === 0x4b,
  // OLE2 (.doc legado).
  "application/msword": (b) =>
    b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
};

function isFtyp(b: Uint8Array) {
  return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
}

function isEbml(b: Uint8Array) {
  return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

/** text/plain não tem assinatura: rejeita apenas bytes de controle/binário. */
function looksLikeText(b: Uint8Array) {
  const n = Math.min(b.length, 512);
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 0x09 || (c > 0x0d && c < 0x20)) return false;
  }
  return true;
}

export function contentMatchesMime(mime: string, bytes: Uint8Array) {
  if (bytes.byteLength < 12) return false;
  if (mime === "text/plain") return looksLikeText(bytes);
  const check = MAGIC[mime];
  return check ? check(bytes) : false;
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
    if (!contentMatchesMime(file.mime, bytes))
      throw new Error(`O conteúdo do arquivo não corresponde ao formato informado: ${file.name}`);
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
