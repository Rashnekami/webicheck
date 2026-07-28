import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Auth API central: usada pela tela de login web (via wrapper cliente) e
// pelo Webi Diagnostic (agente local/EXE), que não tem sessão de browser
// nem subdomínio — por isso o provider é enviado explicitamente como
// `provider` (slug), não resolvido por Host.
//
// Nunca cria conta: só autentica login+senha já existentes (gerados por
// um admin/supervisor). Google continua sendo tratado só no frontend web
// (fluxo OAuth do Supabase), não por esta rota.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const rl = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rl.get(key);
  if (!entry || entry.resetAt < now) {
    rl.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10; // 10 tentativas/min por (provider+login)
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        let body: { provider?: string; login?: string; senha?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const providerSlug = (body.provider ?? "").trim().toLowerCase();
        const login = (body.login ?? "").trim();
        const senha = body.senha ?? "";

        if (!login || !senha) {
          return json({ error: "missing_credentials" }, 400);
        }

        const rlKey = `${providerSlug}:${login.toLowerCase()}`;
        if (rateLimited(rlKey)) {
          return json({ error: "too_many_attempts" }, 429);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        let providerId: string | null = null;
        if (providerSlug) {
          const { data: provider } = await supabaseAdmin
            .from("providers" as never)
            .select("id, active")
            .eq("slug", providerSlug)
            .maybeSingle<{ id: string; active: boolean }>();
          if (!provider || !provider.active) {
            return json({ error: "invalid_provider" }, 401);
          }
          providerId = provider.id;
        }

        const profileQuery = supabaseAdmin
          .from("profiles")
          .select("id, auth_email, active, provider_id")
          .ilike("login", login);
        const { data: profile } = providerId
          ? await profileQuery.eq("provider_id", providerId).maybeSingle()
          : await profileQuery.is("provider_id", null).maybeSingle();

        if (!profile || !profile.active || !profile.auth_email) {
          // Mesma mensagem para "não existe" e "sem credenciais": não
          // vaza quais logins existem.
          return json({ error: "invalid_credentials" }, 401);
        }

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const anon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
          email: profile.auth_email,
          password: senha,
        });
        if (signInErr || !signIn.session) {
          return json({ error: "invalid_credentials" }, 401);
        }

        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id);
        const role = (roles ?? []).map((r) => r.role).includes("admin")
          ? "admin"
          : (roles ?? []).map((r) => r.role).includes("supervisor")
            ? "supervisor"
            : "tecnico";

        const { data: fresh } = await supabaseAdmin
          .from("profiles")
          .select("must_change_password")
          .eq("id", profile.id)
          .maybeSingle();

        return json({
          token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
          expires_at: signIn.session.expires_at,
          user_id: profile.id,
          provider_id: profile.provider_id,
          role,
          must_change_password: fresh?.must_change_password ?? false,
        });
      },
    },
  },
});
