// Utilitários de token público e hash de integridade do snapshot.

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generatePublicToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToBase64Url(arr);
}

// Ordena chaves recursivamente para garantir hash canônico independente de ordem.
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalStringify((value as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

export async function computeDocumentHash(snapshot: unknown): Promise<string> {
  const canonical = canonicalStringify(snapshot);
  const enc = new TextEncoder().encode(canonical);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function shortHash(hash: string, len = 8): string {
  return hash.slice(0, len).toUpperCase();
}
