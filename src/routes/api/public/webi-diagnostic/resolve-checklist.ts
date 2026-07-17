import { createFileRoute } from "@tanstack/react-router";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++)
    out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/webi-diagnostic/resolve-checklist")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Webi-Integration-Key",
          },
        }),
      POST: async ({ request }) => {
        const key = request.headers.get("x-webi-integration-key")?.trim();
        if (!key) return json({ error: "missing_token" }, 401);
        let body: { numero_publico?: string; codigo_validacao?: string; case_id?: string };
        try {
          body = (await request.json()) as never;
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        if (!body.numero_publico && !body.codigo_validacao && !body.case_id)
          return json({ error: "missing_identifier" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await sha256Hex(key);
        const { data: token } = await supabaseAdmin
          .from("webi_integration_tokens")
          .select("id, user_id, active, expires_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (!token || !token.active) return json({ error: "invalid_token" }, 401);
        if (token.expires_at && new Date(token.expires_at) < new Date())
          return json({ error: "expired_token" }, 401);

        await supabaseAdmin
          .from("webi_integration_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", token.id);

        let q = supabaseAdmin
          .from("checklists")
          .select(
            "id, case_id, revision_number, is_current, status, os, cliente, cidade, numero_publico, codigo_validacao, tecnico_id",
          )
          .eq("is_current", true);
        if (body.case_id) q = q.eq("case_id", body.case_id);
        else if (body.numero_publico) q = q.eq("numero_publico", body.numero_publico);
        else if (body.codigo_validacao) q = q.eq("codigo_validacao", body.codigo_validacao);

        const { data: rows, error } = await q.limit(1);
        if (error) return json({ error: "db_error", detail: error.message }, 500);
        const row = rows?.[0];
        if (!row) return json({ error: "not_found" }, 404);

        return json({
          checklist: {
            id: row.id,
            case_id: row.case_id,
            revision_number: row.revision_number,
            status: row.status,
            os: row.os,
            cliente: row.cliente,
            cidade: row.cidade,
            numero_publico: row.numero_publico,
            codigo_validacao: row.codigo_validacao,
          },
        });
      },
    },
  },
});
