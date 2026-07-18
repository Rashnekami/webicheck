import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type ManagedUserRole = "admin" | "supervisor" | "visualizador" | "tecnico";

export interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  matricula: string | null;
  city: string | null;
  active: boolean;
  role: ManagedUserRole;
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

    const [{ data: profiles, error: profileError }, { data: roles, error: roleError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, phone, matricula, city, active, created_at")
          .in("id", ids),
        supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      ]);

    if (profileError) throw new Error(profileError.message);
    if (roleError) throw new Error(roleError.message);

    const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
    const rolesById = new Map<string, ManagedUserRole>();
    for (const row of roles ?? []) {
      if (row.role === "admin" || !rolesById.has(row.user_id)) {
        rolesById.set(row.user_id, row.role as ManagedUserRole);
      }
    }

    return authUsers
      .map((authUser) => {
        const profile = profileById.get(authUser.id);
        return {
          id: authUser.id,
          email: profile?.email || authUser.email || "",
          full_name:
            profile?.full_name || authUser.user_metadata?.full_name || "Usuário sem perfil",
          phone: profile?.phone ?? null,
          matricula: profile?.matricula ?? null,
          city: profile?.city ?? null,
          active: profile?.active ?? false,
          role: rolesById.get(authUser.id) ?? "tecnico",
          created_at: profile?.created_at ?? authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at ?? null,
          email_confirmed_at: authUser.email_confirmed_at ?? null,
          has_profile: Boolean(profile),
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
    }) => {
      if (!input.userId) throw new Error("Usuário inválido.");
      if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) throw new Error("Informe um e-mail válido.");
      if (input.fullName.trim().length < 2) throw new Error("Informe o nome completo.");
      if (!["admin", "supervisor", "visualizador", "tecnico"].includes(input.role))
        throw new Error("Perfil de acesso inválido.");
      return {
        ...input,
        email: input.email.trim().toLowerCase(),
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        matricula: input.matricula?.trim() || null,
        city: input.city?.trim() || null,
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
      supabaseAdmin.from("profiles").select("active").eq("id", data.userId).maybeSingle(),
    ]);

    if (targetRoleError) throw new Error(targetRoleError.message);
    if (targetProfileError) throw new Error(targetProfileError.message);

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(profileError.message);

    // Primeiro garante o novo papel e só depois remove os demais. Assim,
    // uma falha intermediária nunca deixa o usuário sem papel algum.
    const { error: upsertRoleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
    if (upsertRoleError) throw new Error(upsertRoleError.message);

    const { error: deleteRolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .neq("role", data.role);
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
