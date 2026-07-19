import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function requireAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Somente administradores.");
}

export const getProviderAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const [{ data: provider, error }, { data: devices }, { data: cities }] = await Promise.all([
      context.supabase.from("providers").select("*").eq("id", profile.provider_id).single(),
      context.supabase
        .from("agent_devices")
        .select("*")
        .eq("provider_id", profile.provider_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("provider_cities")
        .select("*")
        .eq("provider_id", profile.provider_id)
        .order("name"),
    ]);
    if (error) throw new Error(error.message);
    return {
      provider,
      devices: devices ?? [],
      cities: cities ?? [],
      canManageCommercial: profile.platform_admin,
    };
  });

export const updateProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status: "active" | "suspended" | "cancelled" }) => data)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    if (!profile.platform_admin) throw new Error("Somente a administração da plataforma.");
    const { error } = await context.supabase
      .from("providers")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", profile.provider_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDeviceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deviceId: string; status: "active" | "suspended" | "revoked" }) => data)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { error } = await context.supabase
      .from("agent_devices")
      .update({
        status: data.status,
        revoked_at: data.status === "revoked" ? new Date().toISOString() : null,
      })
      .eq("id", data.deviceId)
      .eq("provider_id", profile.provider_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { data, error } = await context.supabase
      .from("announcements")
      .select("*")
      .eq("provider_id", profile.provider_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      message: string;
      severity: "info" | "warning" | "critical";
      active: boolean;
    }) => {
      if (data.title.trim().length < 3 || data.message.trim().length < 3)
        throw new Error("Preencha título e mensagem.");
      return data;
    },
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { error } = await context.supabase.from("announcements").insert({
      provider_id: profile.provider_id,
      title: data.title.trim(),
      message: data.message.trim(),
      severity: data.severity,
      active: data.active,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; active: boolean }) => data)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .single();
    if (!profile) throw new Error("Perfil não encontrado.");
    const { error } = await context.supabase
      .from("announcements")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("provider_id", profile.provider_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
