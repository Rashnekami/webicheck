import { createFileRoute } from "@tanstack/react-router";
import { apiJson, secureToken, sha256Hex } from "@/lib/webi-agent-auth.server";

export const Route = createFileRoute("/api/public/webi-diagnostic/device-start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          provider?: string;
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
        if (!body.device_name?.trim() || !/^[a-f0-9]{64}$/i.test(body.fingerprint_hash ?? ""))
          return apiJson({ ok: false, error: "invalid_device" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: provider } = await supabaseAdmin
          .from("providers")
          .select("id, status")
          .eq("slug", (body.provider || "webifibra").toLowerCase())
          .maybeSingle();
        if (!provider) return apiJson({ ok: false, error: "provider_not_found" }, 404);
        if (provider.status !== "active")
          return apiJson({ ok: false, error: "provider_suspended" }, 403);
        const deviceCode = secureToken("wdc_");
        const userCode = secureToken("", 5)
          .replace(/[^A-Z0-9]/gi, "")
          .toUpperCase()
          .slice(0, 8);
        const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
        const { error } = await supabaseAdmin.from("agent_authorization_requests").insert({
          provider_id: provider.id,
          device_code_hash: await sha256Hex(deviceCode),
          user_code: userCode,
          device_name: body.device_name.trim().slice(0, 120),
          fingerprint_hash: body.fingerprint_hash!.toLowerCase(),
          platform: body.platform?.slice(0, 80) || null,
          agent_version: body.agent_version?.slice(0, 40) || null,
          expires_at: expiresAt,
        });
        if (error) return apiJson({ ok: false, error: "authorization_start_failed" }, 500);
        const origin = new URL(request.url).origin;
        return apiJson({
          ok: true,
          device_code: deviceCode,
          user_code: userCode,
          verification_uri: `${origin}/autorizar-agent`,
          verification_uri_complete: `${origin}/autorizar-agent?code=${encodeURIComponent(userCode)}`,
          expires_in: 600,
          interval: 3,
        });
      },
    },
  },
});
