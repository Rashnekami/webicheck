/**
 * Base pública oficial dos links compartilhados (validação técnica e
 * contra-prova do cliente). Hosts de preview/editor exigem login da Lovable,
 * então nunca podem ser enviados ao cliente.
 */
export function publicSiteBase(): string {
  const envBase = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "");
  if (envBase) return envBase;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (/lovable\.dev$|lovableproject\.com$|lovable\.app$|id-preview/.test(host)) {
      return "https://checktecnico.life";
    }
    return window.location.origin;
  }
  return "https://checktecnico.life";
}
