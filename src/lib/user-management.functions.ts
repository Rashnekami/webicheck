import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Gestão de usuários: criação por admin/supervisor, geração de
// credenciais para contas Google-only, e reset de senha temporária.
//
// Regras (não negociáveis, ver AGENTS.md / pedido de auth centralizada):
// - Nunca cria conta duplicada: gerar credenciais para um profile que já
//   tem auth.users (Google) só ANEXA senha, nunca cria user_id novo.
// - Nunca muda user_id nem perde histórico: toda operação usa
//   auth.admin.updateUserById / o profile existente, nunca delete+create.
// - Senha nunca em texto puro em lugar nenhum além da resposta única
//   desta chamada (o admin precisa copiar/entregar na hora).
// - auth_email sintético é sempre <login>@<provider-slug ou "global">.internal
//   — nunca o e-mail de contato real do técnico.

const LOGIN_DOMAIN_SUFFIX = ".internal";

function randomTempPassword(): string {
  // 12 chars, alfanumérico + símbolo, gerado via crypto — não é
  // exposto em log, só no retorno desta chamada.
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const b64 = Buffer.from(bytes).toString("base64url");
  return `${b64}#1`;
}

async function requireAdminOrSupervisor(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível verificar permissões.");
  const allowed = (roles ?? []).some(
    (r) => r.role === "admin" || r.role === "supervisor",
  );
  if (!allowed) throw new Error("forbidden: requer admin ou supervisor");
  return roles ?? [];
}

async function resolveProviderSlug(
  supabaseAdmin: SupabaseClient<Database>,
  providerId: string | null,
): Promise<string> {
  if (!providerId) return "global";
  const { data } = await supabaseAdmin
    .from("providers" as never)
    .select("slug")
    .eq("id", providerId)
    .maybeSingle<{ slug: string }>();
  return data?.slug ?? "global";
}

// Cria um técnico novo do zero: gera login sequencial, senha temporária,
// cria o auth.users (via admin API, sem envio de e-mail de confirmação),
// o profile e o user_roles. must_change_password=true.
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { full_name: string; provider_id: string | null; role: "admin" | "tecnico" | "supervisor" }) =>
      d,
  )
  .handler(async ({ data, context }) => {
    await requireAdminOrSupervisor(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const slug = await resolveProviderSlug(supabaseAdmin, data.provider_id);
    const { data: loginData, error: loginErr } = await supabaseAdmin.rpc(
      "generate_next_login" as never,
      { _provider_id: data.provider_id } as never,
    );
    if (loginErr || !loginData) throw new Error("Falha ao gerar login.");
    const login = loginData as unknown as string;
    const authEmail = `${login.toLowerCase()}@${slug}${LOGIN_DOMAIN_SUFFIX}`;
    const tempPassword = randomTempPassword();

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, login },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "Falha ao criar usuário.");
    }

    const newUserId = created.user.id;

    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: newUserId,
      full_name: data.full_name,
      email: authEmail,
      login,
      auth_email: authEmail,
      must_change_password: true,
      credentials_created_by: context.userId,
      credentials_created_at: new Date().toISOString(),
      ...(data.provider_id ? { provider_id: data.provider_id } : {}),
    } as never);
    if (profileErr) {
      // rollback best-effort: não deixa um auth.users órfão sem profile
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw new Error("Falha ao criar profile.");
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role } as never);
    if (roleErr) throw new Error("Usuário criado, mas falha ao atribuir papel.");

    return { user_id: newUserId, login, temp_password: tempPassword, auth_email: authEmail };
  });

// Gera login + senha temporária para um profile que hoje só entra via
// Google. NUNCA cria um novo auth.users: só atualiza a senha do usuário
// existente (mesmo user_id) e preenche login/auth_email/must_change_password.
export const adminIssueCredentialsForExistingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    await requireAdminOrSupervisor(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, login, provider_id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (profileErr || !profile) throw new Error("Usuário não encontrado.");
    if (profile.login) throw new Error("Este usuário já tem login/senha configurados.");

    const slug = await resolveProviderSlug(supabaseAdmin, profile.provider_id ?? null);
    const { data: loginData, error: loginErr } = await supabaseAdmin.rpc(
      "generate_next_login" as never,
      { _provider_id: profile.provider_id ?? null } as never,
    );
    if (loginErr || !loginData) throw new Error("Falha ao gerar login.");
    const login = loginData as unknown as string;
    const authEmail = `${login.toLowerCase()}@${slug}${LOGIN_DOMAIN_SUFFIX}`;
    const tempPassword = randomTempPassword();

    // Atualiza a senha do MESMO auth.users (mesmo user_id) — não cria
    // conta nova. O e-mail de login do Supabase (auth.users.email)
    // continua sendo o do Google; auth_email é só o valor que a tela de
    // login local usa para resolver e chamar signInWithPassword.
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: tempPassword,
    });
    if (pwErr) throw new Error("Falha ao definir senha temporária.");

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        login,
        auth_email: authEmail,
        must_change_password: true,
        credentials_created_by: context.userId,
        credentials_created_at: new Date().toISOString(),
      } as never)
      .eq("id", data.user_id);
    if (updateErr) throw new Error("Falha ao salvar login gerado.");

    return { user_id: data.user_id, login, temp_password: tempPassword, auth_email: authEmail };
  });

// Troca a própria senha (fluxo obrigatório de primeiro login). Qualquer
// usuário autenticado pode chamar para si mesmo — nunca recebe user_id
// do cliente, sempre usa context.userId do token verificado.
export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { new_password: string }) => d)
  .handler(async ({ data, context }) => {
    if (data.new_password.length < 8) {
      throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(
      context.userId,
      { password: data.new_password },
    );
    if (pwErr) throw new Error("Falha ao trocar senha.");

    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false } as never)
      .eq("id", context.userId);
    if (updateErr) throw new Error("Senha trocada, mas falha ao liberar acesso.");

    return { ok: true };
  });

// Status mínimo do usuário logado, usado pelo gate de troca de senha
// obrigatória no primeiro acesso.
export const getMyAuthStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password")
      .eq("id", context.userId)
      .maybeSingle();
    return { must_change_password: data?.must_change_password ?? false };
  });

// Lista usuários para a tela admin: quem já tem login/senha, quem só
// tem Google, e o status must_change_password.
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdminOrSupervisor(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, login, must_change_password, active, provider_id")
      .order("full_name");
    if (error) throw new Error("Falha ao listar usuários.");
    return data ?? [];
  });
