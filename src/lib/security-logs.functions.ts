import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function resolveScope(userId: string): Promise<{ providerId: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("platform_admin, provider_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.platform_admin) return { providerId: null }; // null = vê tudo

  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSupervisor } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "supervisor",
  });
  if (!isAdmin && !isSupervisor) throw new Error("Acesso restrito a administradores.");
  if (!profile?.provider_id) throw new Error("Perfil sem provedor associado.");
  return { providerId: profile.provider_id as string };
}

export const listLoginAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { providerId } = await resolveScope(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("login_attempts")
      .select("id, login, ip, success, reason, geo_country, geo_region, geo_city, created_at, provider_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (providerId) q = q.eq("provider_id", providerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAccessLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { providerId } = await resolveScope(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("access_logs")
      .select("id, user_id, route, method, ip, geo_country, geo_region, geo_city, created_at, provider_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (providerId) q = q.eq("provider_id", providerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });
