import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LoginAccount = {
  id: string;
  user_id: string;
  provider_id: string;
  login: string;
  supabase_email: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

async function loadAdminProvider(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("provider_id, platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error || !profile) throw new Error("Perfil não encontrado.");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Somente administradores podem gerenciar credenciais.");
  return { providerId: profile.provider_id as string, platformAdmin: !!profile.platform_admin };
}

export const listProviderLoginAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoginAccount[]> => {
    const { providerId, platformAdmin } = await loadAdminProvider(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("provider_login_accounts")
      .select("id, user_id, provider_id, login, supabase_email, active, created_at, updated_at")
      .order("login", { ascending: true });
    if (!platformAdmin) q = q.eq("provider_id", providerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as LoginAccount[];
  });

export const createTechnicianCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      providerId?: string;
      login: string;
      password: string;
      fullName: string;
      matricula?: string | null;
      phone?: string | null;
      city?: string | null;
      role: "tecnico" | "almoxarifado" | "admin" | "supervisor" | "noc";
      linkToUserId?: string | null; // opcional: vincular ao usuário existente (que já logou com Google)
    }) => {
      const login = data.login.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(login))
        throw new Error("Login inválido (use letras, números, ponto, hífen ou sublinhado).");
      if (!data.password || data.password.length < 8)
        throw new Error("A senha deve ter pelo menos 8 caracteres.");
      if (!data.fullName || data.fullName.trim().length < 2)
        throw new Error("Informe o nome completo.");
      if (!["tecnico", "almoxarifado", "admin", "supervisor", "noc"].includes(data.role))
        throw new Error("Perfil inválido.");
      return {
        ...data,
        login,
        fullName: data.fullName.trim(),
        matricula: data.matricula?.trim() || null,
        phone: data.phone?.trim() || null,
        city: data.city?.trim() || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { providerId: adminProviderId, platformAdmin } = await loadAdminProvider(context.userId);
    const providerId = platformAdmin && data.providerId ? data.providerId : adminProviderId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Buscar slug do provedor
    const { data: prov, error: provErr } = await supabaseAdmin
      .from("providers")
      .select("slug")
      .eq("id", providerId)
      .single();
    if (provErr || !prov) throw new Error("Provedor não encontrado.");

    const syntheticEmail = `${data.login}@${prov.slug}.webicheck.local`;

    // Já existe login duplicado no mesmo provedor?
    const { data: dup } = await supabaseAdmin
      .from("provider_login_accounts")
      .select("id")
      .eq("provider_id", providerId)
      .ilike("login", data.login)
      .maybeSingle();
    if (dup) throw new Error("Já existe uma credencial com esse login neste provedor.");

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(data.password, 10);

    let userId = data.linkToUserId?.trim() || null;

    if (userId) {
      // Vincular a usuário existente: atualiza senha e email sintético via admin API
      const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
      });
      if (uErr) throw new Error(uErr.message);
    } else {
      // Criar novo auth user com email sintético
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName, city: data.city, login: data.login },
      });
      if (createErr || !created.user) throw new Error(createErr?.message || "Falha ao criar.");
      userId = created.user.id;
    }

    // Upsert profile
    const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email: syntheticEmail,
        full_name: data.fullName,
        matricula: data.matricula,
        phone: data.phone,
        city: data.city,
        provider_id: providerId,
        active: true,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" },
    );
    if (profErr) throw new Error(profErr.message);

    // Ensure role
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: data.role } as never, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(roleErr.message);
    // Remove outros papéis
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .neq("role", data.role as never);

    // Registrar credencial interna
    const { error: insErr } = await supabaseAdmin.from("provider_login_accounts").insert({
      user_id: userId,
      provider_id: providerId,
      login: data.login,
      password_hash: passwordHash,
      supabase_email: syntheticEmail,
      active: true,
      created_by: context.userId,
    } as never);
    if (insErr) throw new Error(insErr.message);

    return { ok: true, userId, login: data.login };
  });

export const resetTechnicianPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; newPassword: string }) => {
    if (!data.newPassword || data.newPassword.length < 8)
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { providerId, platformAdmin } = await loadAdminProvider(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acc, error: accErr } = await supabaseAdmin
      .from("provider_login_accounts")
      .select("id, user_id, provider_id")
      .eq("id", data.accountId)
      .single();
    if (accErr || !acc) throw new Error("Credencial não encontrada.");
    if (!platformAdmin && acc.provider_id !== providerId)
      throw new Error("Credencial de outro provedor.");

    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.newPassword, 10);

    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(acc.user_id, {
      password: data.newPassword,
    });
    if (uErr) throw new Error(uErr.message);

    const { error: upErr } = await supabaseAdmin
      .from("provider_login_accounts")
      .update({ password_hash: hash, updated_at: new Date().toISOString() } as never)
      .eq("id", data.accountId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const deactivateTechnicianCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; active: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { providerId, platformAdmin } = await loadAdminProvider(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acc, error } = await supabaseAdmin
      .from("provider_login_accounts")
      .select("id, provider_id")
      .eq("id", data.accountId)
      .single();
    if (error || !acc) throw new Error("Credencial não encontrada.");
    if (!platformAdmin && acc.provider_id !== providerId)
      throw new Error("Credencial de outro provedor.");
    const { error: upErr } = await supabaseAdmin
      .from("provider_login_accounts")
      .update({ active: data.active, updated_at: new Date().toISOString() } as never)
      .eq("id", data.accountId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });
