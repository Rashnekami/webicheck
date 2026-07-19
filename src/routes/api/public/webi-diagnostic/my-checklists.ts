import { createFileRoute } from "@tanstack/react-router";
import { apiJson, authenticateAgent } from "@/lib/webi-agent-auth.server";

export const Route = createFileRoute("/api/public/webi-diagnostic/my-checklists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateAgent(request, "diagnostic:checklists");
        if ("error" in auth) return auth.error;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
          _user_id: auth.token.user_id,
          _role: "admin",
        });
        let query = supabaseAdmin
          .from("checklists")
          .select(
            "id, numero_publico, codigo_validacao, revision_number, cliente, os, cidade, status, updated_at, service_stage, tecnico_id",
          )
          .eq("provider_id", auth.token.provider_id)
          .eq("is_current", true)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (!isAdmin) query = query.eq("tecnico_id", auth.token.user_id);
        const { data, error } = await query;
        if (error) return apiJson({ ok: false, error: "db_error" }, 500);
        return apiJson({
          ok: true,
          checklists: (data ?? []).map((row) => ({
            ...row,
            checklist_code:
              row.revision_number > 1
                ? `${row.numero_publico}-R${row.revision_number}`
                : row.numero_publico,
          })),
        });
      },
    },
  },
});
