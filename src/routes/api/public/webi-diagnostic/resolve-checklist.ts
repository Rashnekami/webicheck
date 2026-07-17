import { createFileRoute } from "@tanstack/react-router";
import {
  parseChecklistCode,
  SERVICE_TO_TEST_STAGE,
} from "@/lib/checklist-code";

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
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function fmtCode(numero_publico: string | null, revision: number): string {
  if (!numero_publico) return "";
  return revision > 1 ? `${numero_publico}-R${revision}` : numero_publico;
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
          case_id?: string;
        };
        try {
          body = (await request.json()) as never;
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const tokenHash = await sha256Hex(key);
        const { data: token } = await supabaseAdmin
          .from("webi_integration_tokens")
          .select("id, user_id, active, expires_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (!token || !token.active)
          return json({ ok: false, error: "invalid_token" }, 401);
        if (token.expires_at && new Date(token.expires_at) < new Date())
          return json({ ok: false, error: "expired_token" }, 401);

        await supabaseAdmin
          .from("webi_integration_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", token.id);

        // Resolve identificador. Aceita checklist_code (com -Rn),
        // numero_publico, codigo_validacao ou case_id.
        let requestedRev: number | null = null;
        let lookupNumero: string | null = null;
        let lookupCodigo: string | null = null;
        let lookupCaseId: string | null = null;

        if (body.case_id) lookupCaseId = body.case_id;
        else if (body.checklist_code) {
          const p = parseChecklistCode(body.checklist_code);
          if (!p.base)
            return json({ ok: false, error: "invalid_checklist_code" }, 400);
          requestedRev = p.revision;
          if (p.kind === "codigo_validacao") lookupCodigo = p.base;
          else lookupNumero = p.base;
        } else if (body.numero_publico) lookupNumero = body.numero_publico.trim();
        else if (body.codigo_validacao)
          lookupCodigo = body.codigo_validacao.trim();
        else return json({ ok: false, error: "missing_identifier" }, 400);

        // Descobre a linha específica solicitada (pode ser antiga)
        let baseQuery = supabaseAdmin
          .from("checklists")
          .select(
            "id, case_id, revision_number, is_current, superseded_by_checklist_id, status, os, cliente, cidade, numero_publico, codigo_validacao, service_stage, revision_reason, tecnico_id",
          )
          .eq("status", "finalizado")
          .limit(1);

        if (lookupCaseId) {
          baseQuery = baseQuery.eq("case_id", lookupCaseId).eq("is_current", true);
        } else if (lookupCodigo) {
          baseQuery = baseQuery.eq("codigo_validacao", lookupCodigo);
        } else if (lookupNumero) {
          baseQuery = baseQuery.eq("numero_publico", lookupNumero);
          if (requestedRev != null) baseQuery = baseQuery.eq("revision_number", requestedRev);
          else baseQuery = baseQuery.eq("revision_number", 1);
        }

        const { data: rows, error } = await baseQuery;
        if (error) return json({ ok: false, error: "db_error" }, 500);
        const row = rows?.[0];
        if (!row) return json({ ok: false, error: "not_found" }, 404);

        // Busca a revisão atual do case
        const { data: currRows } = await supabaseAdmin
          .from("checklists")
          .select(
            "id, revision_number, numero_publico, service_stage, tecnico_id",
          )
          .eq("case_id", row.case_id)
          .eq("is_current", true)
          .eq("status", "finalizado")
          .limit(1);
        const current = currRows?.[0];

        const isSuperseded = !!current && current.id !== row.id;

        const latestCode = current
          ? fmtCode(current.numero_publico, current.revision_number)
          : null;

        // Nome do técnico da revisão retornada
        const { data: tecProfile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", row.tecnico_id)
          .maybeSingle();

        // Contagem de diagnósticos vinculados ao case
        const { count: diagCount } = await supabaseAdmin
          .from("checklist_diagnostic_reports")
          .select("*", { count: "exact", head: true })
          .eq("case_id", row.case_id)
          .eq("status", "active");

        const defaultTestStage =
          SERVICE_TO_TEST_STAGE[
            (current?.service_stage ?? row.service_stage ?? "initial") as string
          ] ?? "before_change";

        if (isSuperseded) {
          // Ainda devolve os dados mínimos, mas informa que upload deve ir para a revisão nova
          return json(
            {
              ok: false,
              code: "CHECKLIST_SUPERSEDED",
              message: "Existe uma versão mais recente deste checklist.",
              latest_checklist_code: latestCode,
              checklist: {
                id: row.id,
                case_id: row.case_id,
                number: fmtCode(row.numero_publico, row.revision_number),
                validation_code: row.codigo_validacao,
                status: row.status,
                revision_number: row.revision_number,
                is_current: false,
              },
            },
            409,
          );
        }

        return json({
          ok: true,
          checklist: {
            id: row.id,
            case_id: row.case_id,
            number: fmtCode(row.numero_publico, row.revision_number),
            validation_code: row.codigo_validacao,
            status: row.status,
            client: row.cliente,
            service_order: row.os,
            city: row.cidade,
            technician: tecProfile?.full_name ?? null,
            revision_number: row.revision_number,
            revision_reason: row.revision_reason,
            service_stage: row.service_stage,
            is_current: true,
            default_test_stage: defaultTestStage,
            diagnostic_count: diagCount ?? 0,
          },
        });
      },
    },
  },
});
