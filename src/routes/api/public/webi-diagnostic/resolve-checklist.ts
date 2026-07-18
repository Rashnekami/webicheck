import { createFileRoute } from "@tanstack/react-router";
import {
  parseChecklistCode,
  SERVICE_TO_TEST_STAGE,
} from "@/lib/checklist-code";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function fmtCode(numeroPublico: string | null, revision: number): string {
  if (!numeroPublico) return "";
  return revision > 1 ? `${numeroPublico}-R${revision}` : numeroPublico;
}

function normalizedIdentifier(raw: string) {
  return parseChecklistCode(raw).base;
}

export const Route = createFileRoute(
  "/api/public/webi-diagnostic/resolve-checklist",
)({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, X-Webi-Integration-Key",
          },
        }),
      POST: async ({ request }) => {
        const key = request.headers.get("x-webi-integration-key")?.trim();
        if (!key) return json({ ok: false, error: "missing_token" }, 401);

        let body: {
          checklist_code?: string;
          numero_publico?: string;
          codigo_validacao?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const tokenHash = await sha256Hex(key);
        const { data: token } = await supabaseAdmin
          .from("webi_integration_tokens")
          .select("id, user_id, active, expires_at, scopes")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!token || !token.active)
          return json({ ok: false, error: "invalid_token" }, 401);
        if (token.expires_at && new Date(token.expires_at) < new Date())
          return json({ ok: false, error: "expired_token" }, 401);

        const { data: tokenOwner } = await supabaseAdmin
          .from("profiles")
          .select("active")
          .eq("id", token.user_id)
          .maybeSingle();
        if (!tokenOwner?.active)
          return json({ ok: false, error: "inactive_account" }, 403);

        const scopes = (token.scopes ?? []) as string[];
        if (!scopes.includes("diagnostic:resolve")) {
          return json(
            {
              ok: false,
              error: "insufficient_scope",
              required: "diagnostic:resolve",
            },
            403,
          );
        }

        await supabaseAdmin
          .from("webi_integration_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", token.id);

        let requestedRevision: number | null = null;
        let lookupNumero: string | null = null;
        let lookupValidacao: string | null = null;

        if (body.checklist_code) {
          const parsed = parseChecklistCode(body.checklist_code);
          if (!parsed.base)
            return json(
              { ok: false, error: "invalid_checklist_code" },
              400,
            );
          requestedRevision = parsed.revision;
          if (parsed.kind === "codigo_validacao")
            lookupValidacao = parsed.base;
          else lookupNumero = parsed.base;
        } else if (body.numero_publico) {
          lookupNumero = normalizedIdentifier(body.numero_publico);
        } else if (body.codigo_validacao) {
          const parsed = parseChecklistCode(body.codigo_validacao);
          lookupValidacao = parsed.base;
          requestedRevision = parsed.revision;
        } else {
          return json({ ok: false, error: "missing_identifier" }, 400);
        }

        if (!lookupNumero && !lookupValidacao)
          return json({ ok: false, error: "invalid_identifier" }, 400);

        let query = supabaseAdmin
          .from("checklists")
          .select(
            "id, case_id, revision_number, is_current, status, os, cliente, cidade, numero_publico, codigo_validacao, service_stage, revision_reason, tecnico_id",
          )
          .eq("status", "finalizado")
          .order("revision_number", { ascending: false })
          .limit(1);

        if (lookupValidacao) {
          query = query.eq("codigo_validacao", lookupValidacao);
          if (requestedRevision !== null)
            query = query.eq("revision_number", requestedRevision);
        } else {
          query = query.eq("numero_publico", lookupNumero as string);
          query = query.eq("revision_number", requestedRevision ?? 1);
        }

        const { data: rows, error } = await query;
        if (error) return json({ ok: false, error: "db_error" }, 500);
        const checklist = rows?.[0];
        if (!checklist)
          return json({ ok: false, error: "not_found" }, 404);

        if (checklist.tecnico_id !== token.user_id) {
          const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
            _user_id: token.user_id,
            _role: "admin",
          });
          if (!isAdmin)
            return json({ ok: false, error: "forbidden" }, 403);
        }

        // A versão corrente pode estar em rascunho. Filtrar por "finalizado"
        // aqui faria a versão antiga parecer atual e permitiria upload incorreto.
        const { data: current } = await supabaseAdmin
          .from("checklists")
          .select(
            "id, revision_number, numero_publico, service_stage, status",
          )
          .eq("case_id", checklist.case_id)
          .eq("is_current", true)
          .maybeSingle();

        if (!checklist.is_current || (current && current.id !== checklist.id)) {
          return json(
            {
              ok: false,
              code: "CHECKLIST_SUPERSEDED",
              message: "Existe uma versão mais recente deste checklist.",
              latest_checklist_code: current
                ? fmtCode(current.numero_publico, current.revision_number)
                : null,
              latest_status: current?.status ?? null,
              checklist: {
                number: fmtCode(
                  checklist.numero_publico,
                  checklist.revision_number,
                ),
                validation_code: checklist.codigo_validacao,
                status: checklist.status,
                revision_number: checklist.revision_number,
                is_current: false,
              },
            },
            409,
          );
        }

        const { data: technician } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", checklist.tecnico_id)
          .maybeSingle();

        const { count: diagnosticCount } = await supabaseAdmin
          .from("checklist_diagnostic_reports")
          .select("*", { count: "exact", head: true })
          .eq("case_id", checklist.case_id)
          .eq("status", "active");

        const defaultTestStage =
          SERVICE_TO_TEST_STAGE[checklist.service_stage ?? "initial"] ??
          "before_change";

        return json({
          ok: true,
          checklist: {
            number: fmtCode(
              checklist.numero_publico,
              checklist.revision_number,
            ),
            validation_code: checklist.codigo_validacao,
            status: checklist.status,
            client: checklist.cliente,
            service_order: checklist.os,
            city: checklist.cidade,
            technician: technician?.full_name ?? null,
            revision_number: checklist.revision_number,
            revision_reason: checklist.revision_reason,
            service_stage: checklist.service_stage,
            is_current: true,
            default_test_stage: defaultTestStage,
            diagnostic_count: diagnosticCount ?? 0,
          },
        });
      },
    },
  },
});
