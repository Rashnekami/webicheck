import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type ManagedUserRole = "admin" | "tecnico" | "almoxarifado" | "supervisor" | "noc";
const ALL_ROLES: ManagedUserRole[] = ["admin", "tecnico", "almoxarifado", "supervisor", "noc"];

export interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  matricula: string | null;
  city: string | null;
  active: boolean;
  role: ManagedUserRole;
  supervisor_id: string | null;
  supervisor_cities: string[];
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  has_profile: boolean;
}

async function ensureAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Somente administradores.");
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRecord[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Isolamento: admin comum só vê usuários do próprio provedor.
    // Dono da plataforma (platform_admin) vê todos.
    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    const isPlatformAdmin = Boolean(actor?.platform_admin);
    const actorProviderId = actor?.provider_id ?? null;

    const authUsers: Array<{
      id: string;
      email?: string;
      created_at: string;
      last_sign_in_at?: string | null;
      email_confirmed_at?: string | null;
      user_metadata?: { full_name?: string };
    }> = [];

    const perPage = 200;
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw new Error(error.message);
      authUsers.push(...data.users);
      if (data.users.length < perPage) break;
    }

    const ids = authUsers.map((user) => user.id);
    if (ids.length === 0) return [];

    const [
      { data: profiles, error: profileError },
      { data: roles, error: roleError },
      { data: supCities, error: supCitiesError },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, email, full_name, phone, matricula, city, active, created_at, provider_id, supervisor_id",
        )
        .in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("supervisor_cities")
        .select("supervisor_id, city")
        .in("supervisor_id", ids),
    ]);

    if (profileError) throw new Error(profileError.message);
    if (roleError) throw new Error(roleError.message);
    if (supCitiesError) throw new Error(supCitiesError.message);

    const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
    const rolesById = new Map<string, ManagedUserRole>();
    for (const row of roles ?? []) {
      const r = row.role as ManagedUserRole;
      // preferência: admin > supervisor > noc > almoxarifado > tecnico
      const priority: Record<ManagedUserRole, number> = {
        admin: 5,
        supervisor: 4,
        noc: 3,
        almoxarifado: 2,
        tecnico: 1,
      };
      const cur = rolesById.get(row.user_id);
      if (!cur || priority[r] > priority[cur]) rolesById.set(row.user_id, r);
    }
    const citiesBySup = new Map<string, string[]>();
    for (const row of supCities ?? []) {
      const list = citiesBySup.get(row.supervisor_id) ?? [];
      list.push(row.city);
      citiesBySup.set(row.supervisor_id, list);
    }

    return authUsers
      .filter((authUser) => {
        if (isPlatformAdmin) return true;
        const p = profileById.get(authUser.id) as { provider_id?: string | null } | undefined;
        return p?.provider_id && p.provider_id === actorProviderId;
      })
      .map((authUser) => {
        const profile = profileById.get(authUser.id) as
          | { supervisor_id?: string | null }
          | undefined;
        const p = profileById.get(authUser.id);
        return {
          id: authUser.id,
          email: p?.email || authUser.email || "",
          full_name:
            p?.full_name || authUser.user_metadata?.full_name || "Usuário sem perfil",
          phone: p?.phone ?? null,
          matricula: p?.matricula ?? null,
          city: p?.city ?? null,
          active: p?.active ?? false,
          role: rolesById.get(authUser.id) ?? "tecnico",
          supervisor_id: profile?.supervisor_id ?? null,
          supervisor_cities: citiesBySup.get(authUser.id) ?? [],
          created_at: p?.created_at ?? authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at ?? null,
          email_confirmed_at: authUser.email_confirmed_at ?? null,
          has_profile: Boolean(p),
        } satisfies AdminUserRecord;
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
  });


export const updateAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      email: string;
      fullName: string;
      phone?: string | null;
      matricula?: string | null;
      city?: string | null;
      active: boolean;
      role: ManagedUserRole;
      supervisorId?: string | null;
      supervisorCities?: string[];
    }) => {
      if (!input.userId) throw new Error("Usuário inválido.");
      if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error("Informe um e-mail válido.");
      if (input.fullName.trim().length < 2) throw new Error("Informe o nome completo.");
      if (!ALL_ROLES.includes(input.role))
        throw new Error("Perfil de acesso inválido.");
      return {
        ...input,
        email: input.email.trim().toLowerCase(),
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        matricula: input.matricula?.trim() || null,
        city: input.city?.trim() || null,
        supervisorId: input.supervisorId?.trim() || null,
        supervisorCities: (input.supervisorCities ?? []).map((c) => c.trim()).filter(Boolean),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);

    if (data.userId === context.userId && !data.active)
      throw new Error("Você não pode inativar seu próprio acesso.");
    if (data.userId === context.userId && data.role !== "admin")
      throw new Error("Você não pode remover seu próprio perfil de administrador.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: targetRoles, error: targetRoleError },
      { data: targetProfile, error: targetProfileError },
    ] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("profiles")
        .select("active, provider_id")
        .eq("id", data.userId)
        .maybeSingle(),
    ]);

    if (targetRoleError) throw new Error(targetRoleError.message);
    if (targetProfileError) throw new Error(targetProfileError.message);

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .single();
    if (actorProfileError || !actorProfile)
      throw new Error("Provedor do administrador não encontrado.");

    const targetIsAdmin = (targetRoles ?? []).some((row) => row.role === "admin");
    const removesActiveAdmin =
      targetIsAdmin && targetProfile?.active !== false && (!data.active || data.role !== "admin");

    if (removesActiveAdmin) {
      const { data: adminRoles, error: adminRoleError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRoleError) throw new Error(adminRoleError.message);

      const adminIds = (adminRoles ?? []).map((row) => row.user_id);
      const { count, error: activeAdminError } = await supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .in("id", adminIds)
        .eq("active", true);
      if (activeAdminError) throw new Error(activeAdminError.message);
      if ((count ?? 0) <= 1) throw new Error("O último administrador ativo não pode ser removido.");
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      user_metadata: { full_name: data.fullName },
      ban_duration: data.active ? "none" : "876000h",
    });
    if (authError) throw new Error(authError.message);

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: data.userId,
        email: data.email,
        full_name: data.fullName,
        phone: data.phone,
        matricula: data.matricula,
        city: data.city,
        active: data.active,
        provider_id: targetProfile?.provider_id ?? actorProfile.provider_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(profileError.message);

    // Primeiro garante o novo papel e só depois remove os demais. Assim,
    // uma falha intermediária nunca deixa o usuário sem papel algum.
    const { error: upsertRoleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: data.role } as never, { onConflict: "user_id,role" });
    if (upsertRoleError) throw new Error(upsertRoleError.message);

    const { error: deleteRolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .neq("role", data.role as never);
    if (deleteRolesError) throw new Error(deleteRolesError.message);

    if (!data.active) {
      const { error: tokenError } = await supabaseAdmin
        .from("webi_integration_tokens")
        .update({
          active: false,
          revoked_at: new Date().toISOString(),
        })
        .eq("user_id", data.userId)
        .eq("active", true);
      if (tokenError) throw new Error(tokenError.message);
    }

    return { ok: true };
  });
