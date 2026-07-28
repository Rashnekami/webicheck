import { createFileRoute } from "@tanstack/react-router";
import { apiJson, secureToken, sha256Hex } from "@/lib/webi-agent-auth.server";

/**
 * Login direto do Webi Diagnostic (EXE/app local): provedor + login + senha,
 * SEM navegador e SEM Google — a senha em si é a aprovação, diferente do
 * fluxo device-start/device-token (que exige aprovação humana via browser
 * em /autorizar-agent, podendo ser com Google ali).
 *
 * Reaproveita a mesma verificação de senha que /api/public/auth/login-internal
 * usa (bcrypt contra provider_login_accounts), mas em vez de devolver uma
 * sessão Supabase, emite direto um webi_integration_tokens — a mesma
 * credencial opaca (X-Webi-Integration-Key) que resolve-checklist e
 * upload-report já esperam. O dispositivo é criado/reaproveitado
 * automaticamente (sem passar por agent_authorization_requests), já que
 * não há aprovação humana nesse caminho.
 */
export const Route = createFileRoute("/api/public/webi-diagnostic/device-login")({
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
        let body: {
          provider?: string;
          login?: string;
          password?: string;
          device_name?: string;
          fingerprint_hash?: string;
          platform?: string;
          agent_version?: string;
        };
        try {
          body = await request.json();
        } catch {
          return apiJson({ ok: false, error: "invalid_json" }, 400);
        }

        const providerSlug = body.provider?.trim().toLowerCase();
        const login = body.login?.trim().toLowerCase();
        const password = body.password;
        if (!providerSlug || !login || !password) {
          return apiJson({ ok: false, error: "missing_credentials" }, 400);
        }
        if (!body.device_name?.trim() || !/^[a-f0-9]{64}$/i.test(body.fingerprint_hash ?? "")) {
          return apiJson({ ok: false, error: "invalid_device" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: provider } = await supabaseAdmin
          .from("providers")
          .select("id, status")
          .eq("slug", providerSlug)
          .maybeSingle();
        if (!provider) return apiJson({ ok: false, error: "provider_not_found" }, 404);
        if (provider.status !== "active")
          return apiJson({ ok: false, error: "provider_suspended" }, 403);

        const { data: account } = await supabaseAdmin
          .from("provider_login_accounts")
          .select("id, user_id, password_hash, active")
          .eq("provider_id", provider.id)
          .ilike("login", login)
          .maybeSingle();
        if (!account || !account.active)
          return apiJson({ ok: false, error: "invalid_credentials" }, 401);

        const bcrypt = await import("bcryptjs");
        const ok = await bcrypt.compare(password, account.password_hash as string);
        if (!ok) return apiJson({ ok: false, error: "invalid_credentials" }, 401);

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("active")
          .eq("id", account.user_id)
          .maybeSingle();
        if (!profile?.active) return apiJson({ ok: false, error: "inactive_account" }, 403);

        // Cria/reaproveita o dispositivo (mesma trinca provider+user+fingerprint
        // do fluxo device-code — UNIQUE constraint garante idempotência).
        const { data: device, error: deviceErr } = await supabaseAdmin
          .from("agent_devices")
          .upsert(
            {
              provider_id: provider.id,
              user_id: account.user_id,
              fingerprint_hash: body.fingerprint_hash!.toLowerCase(),
              name: body.device_name.trim().slice(0, 120),
              platform: body.platform?.slice(0, 80) || null,
              agent_version: body.agent_version?.slice(0, 40) || null,
              status: "active",
              last_seen_at: new Date().toISOString(),
            } as never,
            { onConflict: "provider_id,user_id,fingerprint_hash" },
          )
          .select("id, status")
          .single();
        if (deviceErr || !device) return apiJson({ ok: false, error: "device_upsert_failed" }, 500);
        if (device.status !== "active")
          return apiJson({ ok: false, error: "device_suspended" }, 403);

        const tokenValue = secureToken("wdk_");
        const { error: tokenErr } = await supabaseAdmin.from("webi_integration_tokens").insert({
          user_id: account.user_id,
          provider_id: provider.id,
          device_id: device.id,
          name: `Agent - ${body.device_name.trim().slice(0, 120)}`,
          token_prefix: tokenValue.slice(0, 10),
          token_hash: await sha256Hex(tokenValue),
          scopes: ["diagnostic:resolve", "diagnostic:upload", "diagnostic:checklists"],
          active: true,
        } as never);
        if (tokenErr) return apiJson({ ok: false, error: "token_issue_failed" }, 500);

        return apiJson({ ok: true, access_token: tokenValue, token_type: "WebiIntegrationKey" });
      },
    },
  },
});
