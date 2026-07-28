import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function secureToken(prefix: string, bytesLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return prefix + Buffer.from(bytes).toString("base64url");
}

export function apiJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export async function authenticateAgent(request: Request, requiredScope: string) {
  const key = request.headers.get("x-webi-integration-key")?.trim();
  if (!key) return { error: apiJson({ ok: false, error: "missing_token" }, 401) } as const;
  const tokenHash = await sha256Hex(key);
  const { data: token } = await supabaseAdmin
    .from("webi_integration_tokens")
    .select("id, user_id, provider_id, device_id, active, expires_at, scopes")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!token?.active || (token.expires_at && new Date(token.expires_at) <= new Date()))
    return { error: apiJson({ ok: false, error: "invalid_token" }, 401) } as const;
  const [{ data: profile }, { data: provider }, deviceResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("active, provider_id")
      .eq("id", token.user_id)
      .maybeSingle(),
    supabaseAdmin.from("providers").select("status").eq("id", token.provider_id).maybeSingle(),
    token.device_id
      ? supabaseAdmin.from("agent_devices").select("status").eq("id", token.device_id).maybeSingle()
      : Promise.resolve({ data: { status: "active" } }),
  ]);
  if (!profile?.active)
    return { error: apiJson({ ok: false, error: "inactive_account" }, 403) } as const;
  if (profile.provider_id !== token.provider_id || provider?.status !== "active")
    return { error: apiJson({ ok: false, error: "provider_suspended" }, 403) } as const;
  if (deviceResult.data?.status !== "active")
    return { error: apiJson({ ok: false, error: "device_suspended" }, 403) } as const;
  if (!(token.scopes ?? []).includes(requiredScope))
    return {
      error: apiJson({ ok: false, error: "insufficient_scope", required: requiredScope }, 403),
    } as const;
  await Promise.all([
    supabaseAdmin
      .from("webi_integration_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", token.id),
    token.device_id
      ? supabaseAdmin
          .from("agent_devices")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", token.device_id)
      : Promise.resolve(),
  ]);
  return { token } as const;
}
