import { createFileRoute } from "@tanstack/react-router";
import { parseChecklistCode, SERVICE_TO_TEST_STAGE } from "@/lib/checklist-code";

const MAX_BYTES = 20 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_STAGES = new Set([
  "before_change",
  "after_ont_change",
  "noc_retest",
  "additional_test",
]);

type ChecklistRow = {
  id: string;
  case_id: string;
  tecnico_id: string;
  is_current: boolean;
  status: string;
  numero_publico: string | null;
  codigo_validacao: string | null;
  revision_number: number;
  service_stage: string;
};

function fmtCode(numeroPublico: string | null, revision: number): string {
  if (!numeroPublico) return "";
  return revision > 1 ? `${numeroPublico}-R${revision}` : numeroPublico;
}

async function sha256HexOf(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexString(value: string): Promise<string> {
  return sha256HexOf(new TextEncoder().encode(value).buffer as ArrayBuffer);
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

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "_").slice(0, 120);
  return cleaned || "report.pdf";
}

function isValidIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

export const Route = createFileRoute("/api/public/webi-diagnostic/upload-report")({
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
        if (!key) return json({ ok: false, error: "missing_token" }, 401);

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.startsWith("multipart/form-data")) {
          return json({ ok: false, error: "expected_multipart_form_data" }, 415);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ ok: false, error: "invalid_multipart" }, 400);
        }

        // checklist_id é propositalmente ignorado: IDs internos não fazem parte
        // do contrato público. O Agent deve sempre enviar checklist_code.
        const checklistCodeRaw = String(form.get("checklist_code") ?? "").trim();
        const sessionId = String(form.get("diagnostic_session_id") ?? "").trim();
        const stage = String(form.get("test_stage") ?? "").trim();
        const primaryHash = String(form.get("pdf_sha256") ?? "")
          .trim()
          .toLowerCase();
        const legacyHash = String(form.get("sha256") ?? "")
          .trim()
          .toLowerCase();
        const claimedHash = primaryHash || legacyHash;
        const agentVersion = String(form.get("agent_version") ?? "").trim() || null;
        const generatedAt = String(form.get("generated_at") ?? "").trim() || null;
        const fileEntry = form.get("file");

        if (!checklistCodeRaw) return json({ ok: false, error: "missing_checklist_code" }, 400);
        if (!UUID_PATTERN.test(sessionId)) {
          return json({ ok: false, error: "invalid_diagnostic_session_id" }, 400);
        }
        if (!ALLOWED_STAGES.has(stage))
          return json({ ok: false, error: "invalid_test_stage" }, 400);
        if (!claimedHash) return json({ ok: false, error: "missing_pdf_sha256" }, 400);
        if (!SHA256_PATTERN.test(claimedHash))
          return json({ ok: false, error: "invalid_pdf_sha256" }, 400);
        if (generatedAt && !isValidIsoDate(generatedAt))
          return json({ ok: false, error: "invalid_generated_at" }, 400);
        if (!(fileEntry instanceof File)) return json({ ok: false, error: "missing_file" }, 400);
        if (!/\.pdf$/i.test(fileEntry.name))
          return json({ ok: false, error: "invalid_file_extension" }, 415);
        if (fileEntry.type !== "application/pdf")
          return json({ ok: false, error: "unsupported_media_type" }, 415);
        if (fileEntry.size > MAX_BYTES)
          return json({ ok: false, error: "file_too_large", max_bytes: MAX_BYTES }, 413);
        if (fileEntry.size < 8) return json({ ok: false, error: "file_too_small" }, 400);

        const buffer = await fileEntry.arrayBuffer();
        const magic = String.fromCharCode(...new Uint8Array(buffer.slice(0, 5)));
        if (magic !== "%PDF-") return json({ ok: false, error: "not_a_pdf" }, 415);

        const realHash = await sha256HexOf(buffer);
        if (claimedHash !== realHash) {
          return json(
            {
              ok: false,
              error: "hash_mismatch",
              expected: realHash,
              got: claimedHash,
            },
            400,
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tokenHash = await sha256HexString(key);
        const { data: token } = await supabaseAdmin
          .from("webi_integration_tokens")
          .select("id, user_id, active, expires_at, scopes")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (!token || !token.active) return json({ ok: false, error: "invalid_token" }, 401);
        if (token.expires_at && new Date(token.expires_at) < new Date())
          return json({ ok: false, error: "expired_token" }, 401);

        const { data: tokenOwner } = await supabaseAdmin
          .from("profiles")
          .select("active")
          .eq("id", token.user_id)
          .maybeSingle();
        if (!tokenOwner?.active) return json({ ok: false, error: "inactive_account" }, 403);

        const scopes = (token.scopes ?? []) as string[];
        if (!scopes.includes("diagnostic:upload")) {
          return json(
            {
              ok: false,
              error: "insufficient_scope",
              required: "diagnostic:upload",
            },
            403,
          );
        }

        const { data: allowed, error: rateError } = await supabaseAdmin.rpc(
          "consume_webi_rate_limit",
          {
            _token_id: token.id,
            _action: "diagnostic:upload",
            _limit: 30,
            _window_seconds: 60,
          },
        );
        if (rateError) return json({ ok: false, error: "rate_limit_unavailable" }, 503);
        if (!allowed) return json({ ok: false, error: "rate_limited" }, 429);

        const parsed = parseChecklistCode(checklistCodeRaw);
        if (!parsed.base) return json({ ok: false, error: "invalid_checklist_code" }, 400);

        const lookupColumn =
          parsed.kind === "codigo_validacao" ? "codigo_validacao" : "numero_publico";
        let checklistQuery = supabaseAdmin
          .from("checklists")
          .select(
            "id, case_id, tecnico_id, is_current, status, numero_publico, codigo_validacao, revision_number, service_stage",
          )
          .eq(lookupColumn, parsed.base);

        // Um código-base sem -Rn representa R1; nunca redirecionamos um upload
        // silenciosamente para outra revisão.
        if (lookupColumn === "numero_publico") {
          checklistQuery = checklistQuery.eq("revision_number", parsed.revision ?? 1);
        } else if (parsed.revision !== null) {
          checklistQuery = checklistQuery.eq("revision_number", parsed.revision);
        }

        const { data: checklistData } = await checklistQuery
          .order("revision_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const checklist = (checklistData as unknown as ChecklistRow | null) ?? null;

        if (!checklist) return json({ ok: false, error: "checklist_not_found" }, 404);

        const { data: current } = await supabaseAdmin
          .from("checklists")
          .select("id, numero_publico, revision_number, status")
          .eq("case_id", checklist.case_id)
          .eq("is_current", true)
          .maybeSingle();

        if (!checklist.is_current || (current && current.id !== checklist.id)) {
          return json(
            {
              ok: false,
              error: "CHECKLIST_SUPERSEDED",
              message: "Envie o diagnóstico para a versão atual.",
              latest_checklist_code: current
                ? fmtCode(current.numero_publico, current.revision_number)
                : null,
              latest_status: current?.status ?? null,
            },
            409,
          );
        }
        if (checklist.status !== "finalizado")
          return json({ ok: false, error: "checklist_not_finalized" }, 409);

        if (checklist.tecnico_id !== token.user_id) {
          const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
            _user_id: token.user_id,
            _role: "admin",
          });
          if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
        }

        const expectedStage = SERVICE_TO_TEST_STAGE[checklist.service_stage] ?? null;
        if (!expectedStage || stage !== expectedStage) {
          return json(
            {
              ok: false,
              error: "test_stage_mismatch",
              expected_test_stage: expectedStage,
              checklist_service_stage: checklist.service_stage,
            },
            409,
          );
        }

        const reportId = crypto.randomUUID();
        const safeName = sanitizeFilename(fileEntry.name);
        const storagePath = `${checklist.case_id}/${checklist.id}/${reportId}.pdf`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("webi-diagnostic-reports")
          .upload(storagePath, buffer, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadError) {
          return json(
            {
              ok: false,
              error: "storage_error",
              detail: uploadError.message,
            },
            500,
          );
        }

        const { data: linkedRows, error: linkError } = await supabaseAdmin.rpc(
          "link_diagnostic_report",
          {
            _id: reportId,
            _checklist_id: checklist.id,
            _case_id: checklist.case_id,
            _diagnostic_session_id: sessionId,
            _uploaded_by: token.user_id,
            _original_filename: safeName,
            _storage_path: storagePath,
            _sha256: realHash,
            _size_bytes: fileEntry.size,
            _agent_version: agentVersion,
            _generated_at: generatedAt,
            _test_stage: stage,
            _metadata: {
              snapshot_status: "pending",
              contract_version: "1.0",
              used_legacy_sha256_field: !primaryHash && !!legacyHash,
            },
          },
        );

        if (linkError || !linkedRows) {
          await supabaseAdmin.storage.from("webi-diagnostic-reports").remove([storagePath]);
          if (linkError?.code === "23505") {
            return json({ ok: false, error: "duplicate_session" }, 409);
          }
          return json(
            {
              ok: false,
              error: "db_error",
              detail: linkError?.message ?? "link_failed",
            },
            500,
          );
        }

        const linked = Array.isArray(linkedRows) ? linkedRows[0] : linkedRows;
        if (!linked) {
          await supabaseAdmin.storage.from("webi-diagnostic-reports").remove([storagePath]);
          return json({ ok: false, error: "db_error" }, 500);
        }

        await supabaseAdmin
          .from("webi_integration_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", token.id);

        let snapshotStatus: "ready" | "pending" = "pending";
        let snapshotId: string | null = null;
        let snapshotError: string | null = null;
        try {
          const { regenerateChecklistSnapshot } = await import("@/lib/snapshot-service.server");
          const snapshot = await regenerateChecklistSnapshot(checklist.id);
          if (!snapshot) throw new Error("snapshot_not_created");
          snapshotStatus = "ready";
          snapshotId = snapshot.id;
        } catch (error) {
          snapshotError = error instanceof Error ? error.message : "unknown_snapshot_error";
          console.error("snapshot_regenerate_failed", error);
        }

        await supabaseAdmin
          .from("checklist_diagnostic_reports")
          .update({
            metadata: {
              snapshot_status: snapshotStatus,
              snapshot_id: snapshotId,
              snapshot_error: snapshotError,
              contract_version: "1.0",
              used_legacy_sha256_field: !primaryHash && !!legacyHash,
            },
          })
          .eq("id", reportId);

        return json(
          {
            ok: snapshotStatus === "ready",
            accepted: true,
            snapshot_status: snapshotStatus,
            warning: snapshotStatus === "pending" ? "report_stored_snapshot_pending" : undefined,
            report: {
              id: linked.id,
              diagnostic_session_id: sessionId,
              created_at: linked.created_at,
              sha256: realHash,
              size_bytes: fileEntry.size,
              report_sequence: linked.report_sequence,
              test_stage: stage,
              original_filename: safeName,
              agent_version: agentVersion,
              generated_at: generatedAt,
            },
            checklist: {
              checklist_code: fmtCode(checklist.numero_publico, checklist.revision_number),
              revision_number: checklist.revision_number,
              service_stage: checklist.service_stage,
            },
            snapshot: {
              id: snapshotId,
              status: snapshotStatus,
            },
          },
          snapshotStatus === "ready" ? 201 : 202,
        );
      },
    },
  },
});
