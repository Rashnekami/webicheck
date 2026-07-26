import { createFileRoute } from "@tanstack/react-router";

/**
 * Login interno usuário+senha (por provedor).
 *
 * Recebe: { provider_slug, login, password }
 * Retorna: { access_token, refresh_token } — o front chama supabase.auth.setSession(...)
 *
 * Validamos a senha contra o hash bcrypt em `provider_login_accounts` e,
 * em caso de sucesso, resetamos temporariamente a senha via admin API
 * para o valor fornecido e assinamos com `signInWithPassword` do lado
 * do servidor usando o email sintético.
 */
export const Route = createFileRoute("/api/public/auth/login-internal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            provider_slug?: string;
            login?: string;
            password?: string;
          };
          const providerSlug = body.provider_slug?.trim().toLowerCase();
          const login = body.login?.trim().toLowerCase();
          const password = body.password;
          if (!providerSlug || !login || !password) {
            return Response.json({ error: "Dados incompletos." }, { status: 400 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: provider } = await supabaseAdmin
            .from("providers")
            .select("id, status")
            .eq("slug", providerSlug)
            .maybeSingle();
          if (!provider) return Response.json({ error: "Provedor não encontrado." }, { status: 404 });
          if (provider.status !== "active")
            return Response.json({ error: "Provedor suspenso." }, { status: 403 });

          const { data: account } = await supabaseAdmin
            .from("provider_login_accounts")
            .select("id, user_id, password_hash, supabase_email, active")
            .eq("provider_id", provider.id)
            .ilike("login", login)
            .maybeSingle();
          if (!account || !account.active)
            return Response.json({ error: "Login ou senha inválidos." }, { status: 401 });

          const bcrypt = await import("bcryptjs");
          const ok = await bcrypt.compare(password, account.password_hash as string);
          if (!ok) return Response.json({ error: "Login ou senha inválidos." }, { status: 401 });

          // Verifica se profile ativo
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("active")
            .eq("id", account.user_id)
            .maybeSingle();
          if (!profile?.active)
            return Response.json({ error: "Acesso inativo." }, { status: 403 });

          // Fazer sign-in server-side com o email sintético e a senha do usuário
          // (o hash em provider_login_accounts é fonte da verdade; o auth.users
          // sempre carrega a mesma senha porque atualizamos em create/reset).
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false } },
          );
          const { data: signed, error: signErr } = await supabase.auth.signInWithPassword({
            email: account.supabase_email as string,
            password,
          });
          if (signErr || !signed.session) {
            // fallback: se a senha no auth.users ficou fora de sync, sincroniza e tenta novamente
            await supabaseAdmin.auth.admin.updateUserById(account.user_id as string, { password });
            const retry = await supabase.auth.signInWithPassword({
              email: account.supabase_email as string,
              password,
            });
            if (retry.error || !retry.data.session) {
              return Response.json({ error: "Falha ao autenticar." }, { status: 500 });
            }
            return Response.json({
              access_token: retry.data.session.access_token,
              refresh_token: retry.data.session.refresh_token,
            });
          }
          return Response.json({
            access_token: signed.session.access_token,
            refresh_token: signed.session.refresh_token,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erro inesperado.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
