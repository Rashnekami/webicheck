import { createFileRoute } from "@tanstack/react-router";
import { apiJson, secureToken, sha256Hex } from "@/lib/webi-agent-auth.server";

export const Route = createFileRoute("/api/public/webi-diagnostic/device-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { device_code?: string };
        try {
          body = await request.json();
        } catch {
          return apiJson({ ok: false, error: "invalid_json" }, 400);
        }
        if (!body.device_code) return apiJson({ ok: false, error: "missing_device_code" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth } = await supabaseAdmin
          .from("agent_authorization_requests")
          .select("*")
          .eq("device_code_hash", await sha256Hex(body.device_code))
          .maybeSingle();
        if (!auth) return apiJson({ ok: false, error: "invalid_device_code" }, 401);
        if (new Date(auth.expires_at) <= new Date())
          return apiJson({ ok: false, error: "expired_token" }, 400);
        if (auth.status === "pending")
          return apiJson({ ok: false, error: "authorization_pending" }, 428);
        if (auth.status !== "approved" || !auth.approved_by || !auth.device_id)
          return apiJson({ ok: false, error: "access_denied" }, 403);
        const tokenValue = secureToken("wdk_");
        const { error } = await supabaseAdmin.rpc("consume_agent_authorization", {
          _device_code_hash: await sha256Hex(body.device_code),
          _token_hash: await sha256Hex(tokenValue),
          _token_prefix: tokenValue.slice(0, 10),
        });
        if (error) {
          if (error.message.includes("authorization_not_approved"))
            return apiJson({ ok: false, error: "device_code_already_used" }, 409);
          return apiJson({ ok: false, error: "token_issue_failed" }, 500);
        }
        return apiJson({ ok: true, access_token: tokenValue, token_type: "WebiIntegrationKey" });
      },
    },
  },
});
