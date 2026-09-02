import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Troca a própria senha (fluxo obrigatório de primeiro acesso após
// criação/reset de credencial pelo admin). Nunca recebe user_id do
// cliente — sempre usa context.userId do token verificado.
export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { newPassword: string }) => {
    if (!data.newPassword || data.newPassword.length < 8)
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
    });
    if (pwErr) throw new Error("Falha ao trocar senha.");

    // Mantém o hash em provider_login_accounts em sincronia, se existir
    // (quem só usa Google não tem linha aqui — tudo bem, o update abaixo
    // simplesmente não afeta nenhuma linha nesse caso).
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.newPassword, 10);
    await supabaseAdmin
      .from("provider_login_accounts")
      .update({ password_hash: hash, updated_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false } as never)
      .eq("id", context.userId);
    if (profErr) throw new Error("Senha trocada, mas falha ao liberar acesso.");

    return { ok: true };
  });

export const getMyAuthStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("must_change_password")
      .eq("id", context.userId)
      .maybeSingle();
    return { must_change_password: Boolean((data as { must_change_password?: boolean } | null)?.must_change_password) };
  });

// Define o e-mail pessoal obrigatório do usuário (primeiro acesso).
// Não altera o e-mail sintético usado pelo login interno — apenas
// registra o contato real em profiles.contact_email.
export const setMyContactEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string }) => {
    const email = data.email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new Error("Informe um e-mail válido.");
    return { email };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("contact_email", data.email)
      .neq("id", context.userId)
      .maybeSingle();
    if (taken) throw new Error("Este e-mail já está vinculado a outro usuário.");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        contact_email: data.email,
        contact_email_set_at: new Date().toISOString(),
      } as never)
      .eq("id", context.userId);
    if (error) throw new Error("Não foi possível salvar o e-mail.");
    return { ok: true };
  });
