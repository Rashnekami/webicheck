import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAgentAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userCode: string }) => ({
    userCode: data.userCode.trim().toUpperCase(),
  }))
  .handler(async ({ context, data }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id, active")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { data: provider } = await context.supabase
      .from("providers")
      .select("status")
      .eq("id", profile.provider_id)
      .single();
    if (!provider) throw new Error("Provedor não encontrado.");
    if (!profile.active || provider.status !== "active")
      throw new Error("Acesso do usuário ou provedor suspenso.");
    const { data: request, error } = await context.supabase
      .from("agent_authorization_requests")
      .select("id, user_code, device_name, platform, agent_version, status, expires_at")
      .eq("user_code", data.userCode)
      .eq("provider_id", profile.provider_id)
      .maybeSingle();
    if (error || !request) throw new Error("Código de autorização inválido.");
    if (request.status !== "pending" || new Date(request.expires_at) <= new Date())
      throw new Error("Código expirado ou já utilizado.");
    return request;
  });

export const approveAgentAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userCode: string }) => ({
    userCode: data.userCode.trim().toUpperCase(),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, active")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { data: provider } = await supabaseAdmin
      .from("providers")
      .select("status")
      .eq("id", profile.provider_id)
      .single();
    if (!provider) throw new Error("Provedor não encontrado.");
    if (!profile.active || provider.status !== "active")
      throw new Error("Acesso do usuário ou provedor suspenso.");
    const { data: request } = await supabaseAdmin
      .from("agent_authorization_requests")
      .select("*")
      .eq("user_code", data.userCode)
      .eq("provider_id", profile.provider_id)
      .eq("status", "pending")
      .maybeSingle();
    if (!request || new Date(request.expires_at) <= new Date())
      throw new Error("Código expirado ou já utilizado.");
    const { data: device, error: deviceError } = await supabaseAdmin
      .from("agent_devices")
      .upsert(
        {
          provider_id: profile.provider_id,
          user_id: context.userId,
          name: request.device_name,
          fingerprint_hash: request.fingerprint_hash,
          platform: request.platform,
          agent_version: request.agent_version,
          status: "active",
          revoked_at: null,
        },
        { onConflict: "provider_id,user_id,fingerprint_hash" },
      )
      .select("id")
      .single();
    if (deviceError) throw new Error(deviceError.message);
    const { data: updated, error } = await supabaseAdmin
      .from("agent_authorization_requests")
      .update({
        status: "approved",
        approved_by: context.userId,
        device_id: device.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error || !updated) throw new Error("Este código já foi processado.");
    return { ok: true, deviceName: request.device_name };
  });
