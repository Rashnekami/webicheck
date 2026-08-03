// Helpers server-only de segurança: extração de IP, geolocalização
// best-effort e registro de tentativas de login / acesso autenticado.
// Nunca deve ser importado por código client-side.

export function extractClientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

type GeoInfo = { country: string | null; region: string | null; city: string | null };

const GEO_TIMEOUT_MS = 1200;

// Lookup best-effort (não bloqueia o fluxo se falhar/expirar). Usa ip-api.com
// (sem chave, uso não-comercial). Se precisar de volume maior/mais precisão,
// trocar por MaxMind GeoLite2 local (ver prompt de infra).
export async function geolocateIp(ip: string | null): Promise<GeoInfo> {
  const empty: GeoInfo = { country: null, region: null, city: null };
  if (!ip || ip === "127.0.0.1" || ip.startsWith("10.") || ip.startsWith("192.168.")) return empty;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
    };
    if (json.status !== "success") return empty;
    return {
      country: json.country ?? null,
      region: json.regionName ?? null,
      city: json.city ?? null,
    };
  } catch {
    return empty;
  }
}

// Amostragem: gravar access_logs em toda chamada autenticada seria caro
// (uma linha por request de app inteiro). Loga só 1 em N chamadas, o que
// já é suficiente para detectar padrão de IP/geoloc anômalo por usuário.
const ACCESS_LOG_SAMPLE_RATE = 0.1;
export function shouldSampleAccessLog(): boolean {
  return Math.random() < ACCESS_LOG_SAMPLE_RATE;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_LOGIN = 5;
const MAX_ATTEMPTS_PER_IP = 20;

// Verifica se login+IP já estourou o limite de tentativas na janela atual.
// Roda ANTES de checar a senha, para nem gastar tempo com bcrypt se já
// estiver bloqueado.
export async function isLoginRateLimited(
  login: string,
  ip: string | null,
): Promise<{ blocked: boolean; retryAfterSeconds?: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count: byLogin } = await supabaseAdmin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .ilike("login", login)
    .eq("success", false)
    .gte("created_at", since);

  if ((byLogin ?? 0) >= MAX_ATTEMPTS_PER_LOGIN) {
    return { blocked: true, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }

  if (ip) {
    const { count: byIp } = await supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("success", false)
      .gte("created_at", since);
    if ((byIp ?? 0) >= MAX_ATTEMPTS_PER_IP) {
      return { blocked: true, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
    }
  }

  return { blocked: false };
}

export async function recordLoginAttempt(params: {
  providerId: string | null;
  login: string;
  ip: string | null;
  success: boolean;
  reason?: string;
  userAgent: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const geo = await geolocateIp(params.ip);
    await supabaseAdmin.from("login_attempts").insert({
      provider_id: params.providerId,
      login: params.login,
      ip: params.ip,
      success: params.success,
      reason: params.reason ?? null,
      user_agent: params.userAgent?.slice(0, 300) ?? null,
      geo_country: geo.country,
      geo_region: geo.region,
      geo_city: geo.city,
    });
  } catch (e) {
    console.warn("[security] falha ao gravar login_attempts", e);
  }
}

export async function recordAccessLog(params: {
  providerId: string | null;
  userId: string | null;
  route: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const geo = await geolocateIp(params.ip);
    await supabaseAdmin.from("access_logs").insert({
      provider_id: params.providerId,
      user_id: params.userId,
      route: params.route,
      method: params.method,
      ip: params.ip,
      user_agent: params.userAgent?.slice(0, 300) ?? null,
      geo_country: geo.country,
      geo_region: geo.region,
      geo_city: geo.city,
    });
  } catch (e) {
    console.warn("[security] falha ao gravar access_logs", e);
  }
}
