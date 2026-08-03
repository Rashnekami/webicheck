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

    // Domínio interno (nunca recebe e-mail de verdade). Trocar de
    // .webicheck.local para .checktecnico.local é seguro: o login lê o
    // e-mail gravado em provider_login_accounts.supabase_email, não o
    // reconstrói a partir do slug — então as contas antigas continuam
    // entrando normalmente com o domínio antigo.
    const syntheticEmail = `${data.login}@${prov.slug}.checktecnico.local`;

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

function randomTempPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url") + "#1";
}

// Igual a createTechnicianCredential, mas login e senha são gerados pelo
// sistema (tec01, tec02...) em vez do admin digitar — reduz erro humano
// e credenciais fracas. must_change_password=true: o técnico é obrigado
// a trocar a senha temporária no primeiro acesso.
export const autoGenerateTechnicianCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      providerId?: string;
      fullName: string;
      matricula?: string | null;
      phone?: string | null;
      city?: string | null;
      role: "tecnico" | "almoxarifado" | "admin" | "supervisor" | "noc";
      linkToUserId?: string | null;
    }) => {
      if (!data.fullName || data.fullName.trim().length < 2)
        throw new Error("Informe o nome completo.");
      if (!["tecnico", "almoxarifado", "admin", "supervisor", "noc"].includes(data.role))
        throw new Error("Perfil inválido.");
      return { ...data, fullName: data.fullName.trim() };
    },
  )
  .handler(async ({ data, context }) => {
    const { providerId: adminProviderId, platformAdmin } = await loadAdminProvider(context.userId);
    const providerId = platformAdmin && data.providerId ? data.providerId : adminProviderId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const login = await nextTechnicianLogin(supabaseAdmin, providerId);
    const password = randomTempPassword();

    const result = await createTechnicianCredential({
      data: {
        providerId: data.providerId,
        login,
        password,
        fullName: data.fullName,
        matricula: data.matricula,
        phone: data.phone,
        city: data.city,
        role: data.role,
        linkToUserId: data.linkToUserId,
      },
    });

    await tryRequirePasswordChange(supabaseAdmin, result.userId!);

    return { ...result, password };
  });

/** Gera o próximo login tecNN pro provedor. Tenta a função do banco
 * primeiro (generate_next_technician_login — atômica, evita corrida entre
 * dois admins criando técnico ao mesmo tempo); se a migration que a criou
 * ainda não foi aplicada no Supabase (função inexistente), calcula do lado
 * do cliente a partir dos logins já cadastrados. Sem isso, criar usuário
 * ficava completamente bloqueado até a migration rodar — mesmo sendo uma
 * ação sem nada a ver com o hardening de auth em si. */
async function nextTechnicianLogin(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  providerId: string,
): Promise<string> {
  const { data: rpcLogin, error: rpcErr } = await supabaseAdmin.rpc(
    "generate_next_technician_login" as never,
    { _provider_id: providerId } as never,
  );
  if (!rpcErr && rpcLogin) return rpcLogin as unknown as string;

  const { data: existing, error: listErr } = await supabaseAdmin
    .from("provider_login_accounts")
    .select("login")
    .eq("provider_id", providerId)
    .ilike("login", "tec%");
  if (listErr) throw new Error("Falha ao gerar login.");

  let next = 1;
  for (const row of existing ?? []) {
    const match = /^tec(\d+)$/i.exec((row as { login: string }).login);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  const taken = new Set(
    (existing ?? []).map((r: { login: string }) => r.login.toLowerCase()),
  );
  let candidate = `tec${String(next).padStart(2, "0")}`;
  while (taken.has(candidate)) {
    next += 1;
    candidate = `tec${String(next).padStart(2, "0")}`;
  }
  return candidate;
}

/** must_change_password só existe depois da migration de auth hardening.
 * Marcar isso é desejável mas não pode bloquear a criação do usuário —
 * sem a coluna, o técnico só não é forçado a trocar a senha temporária no
 * 1º acesso (login continua funcionando normalmente, ver
 * fetchMustChangePassword em _authenticated/route.tsx). */
async function tryRequirePasswordChange(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  userId: string,
): Promise<void> {
  await supabaseAdmin
    .from("profiles")
    .update({ must_change_password: true } as never)
    .eq("id", userId);
}

// Igual a resetTechnicianPassword, mas a senha temporária é gerada pelo
// sistema (não digitada pelo admin) e marca must_change_password=true.
export const autoResetTechnicianPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
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

    const password = randomTempPassword();
    await resetTechnicianPassword({ data: { accountId: data.accountId, newPassword: password } });

    await tryRequirePasswordChange(supabaseAdmin, acc.user_id);

    return { ok: true, password };
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
