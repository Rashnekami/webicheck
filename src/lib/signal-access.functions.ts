import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = { from: (table: string) => any; rpc: (fn: string, args?: any) => any };
const db = (client: unknown) => client as unknown as AnyDb;

export interface SignalAccessRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
}

async function loadMe(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: profile }, { data: isAdmin }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", userId)
      .maybeSingle(),
    db(supabaseAdmin).rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  return {
    supabaseAdmin,
    providerId: (profile?.provider_id as string | null) ?? null,
    platformAdmin: Boolean(profile?.platform_admin),
    isAdmin: Boolean(isAdmin),
  };
}

/** O usuário atual pode ver o painel de sinais? E gerenciar as liberações? */
export const getSignalPanelAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, providerId, platformAdmin, isAdmin } = await loadMe(context.userId);
    let granted = false;
    if (!isAdmin && !platformAdmin) {
      const { data } = await db(supabaseAdmin)
        .from("signal_panel_access")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      granted = Boolean(data);
    }
    return {
      hasAccess: isAdmin || platformAdmin || granted,
      canManage: isAdmin || platformAdmin,
      providerId,
    };
  });

/** Pessoas do provedor que podem receber acesso. */
export const listSignalAccessCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ id: string; full_name: string; email: string }[]> => {
    const { supabaseAdmin, providerId, platformAdmin, isAdmin } = await loadMe(context.userId);
    if (!isAdmin && !platformAdmin) throw new Error("Acesso restrito.");
    let q = supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("active", true)
      .order("full_name");
    if (!platformAdmin) q = q.eq("provider_id", providerId ?? "");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      id: p.id as string,
      full_name: (p.full_name as string) || "(sem nome)",
      email: (p.email as string) || "",
    }));
  });

/** Liberações já concedidas. */
export const listSignalPanelAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SignalAccessRow[]> => {
    const { supabaseAdmin, providerId, platformAdmin, isAdmin } = await loadMe(context.userId);
    if (!isAdmin && !platformAdmin) throw new Error("Acesso restrito.");
    let q = db(supabaseAdmin)
      .from("signal_panel_access")
      .select("id, user_id, provider_id, created_at");
    if (!platformAdmin) q = q.eq("provider_id", providerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        rows.map((r) => r.user_id),
      );
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      full_name: (map.get(r.user_id)?.full_name as string) || "(sem nome)",
      email: (map.get(r.user_id)?.email as string) || "",
    }));
  });

/** Concede ou remove o acesso de uma pessoa ao painel de sinais. */
export const setSignalPanelAccess = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: string; allow: boolean }) => {
    if (!data?.userId) throw new Error("Usuário inválido.");
    return data;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, providerId, platformAdmin, isAdmin } = await loadMe(context.userId);
    if (!isAdmin && !platformAdmin) throw new Error("Acesso restrito.");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("provider_id")
      .eq("id", data.userId)
      .maybeSingle();
    const targetProvider = (target?.provider_id as string | null) ?? null;
    if (!targetProvider) throw new Error("Usuário sem provedor.");
    if (!platformAdmin && targetProvider !== providerId)
      throw new Error("Usuário de outro provedor.");

    if (data.allow) {
      const { error } = await db(supabaseAdmin)
        .from("signal_panel_access")
        .upsert(
          { provider_id: targetProvider, user_id: data.userId, granted_by: context.userId },
          { onConflict: "provider_id,user_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db(supabaseAdmin)
        .from("signal_panel_access")
        .delete()
        .eq("user_id", data.userId)
        .eq("provider_id", targetProvider);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
