import { createFileRoute } from "@tanstack/react-router";
import { parseChecklistCode } from "@/lib/checklist-code";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_STAGES = new Set([
  "before_change",
  "after_ont_change",
  "noc_retest",
  "additional_test",
]);

function fmtCode(numero_publico: string | null, revision: number): string {
  if (!numero_publico) return "";
  return revision > 1 ? `${numero_publico}-R${revision}` : numero_publico;
}

async function sha256HexOf(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  const b = new Uint8Array(d);
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
}

async function sha256HexStr(s: string): Promise<string> {
  return sha256HexOf(new TextEncoder().encode(s).buffer as ArrayBuffer);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return cleaned || "report.pdf";
}

// rate limit best-effort em memória
const rl = new Map<string, { count: number; resetAt: number }>();
function checkRate(tokenId: string): boolean {
  const now = Date.now();
  const key = tokenId;
  const entry = rl.get(key);
  if (!entry || entry.resetAt < now) {
    rl.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 30; // 30 uploads/min por token
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
            "Access-Control-Allow-Headers":
              "Content-Type, X-Webi-Integration-Key",
          },
        }),
      POST: async ({ request }) => {
        const key = request.headers.get("x-webi-integration-key")?.trim();
        if (!key) return json({ error: "missing_token" }, 401);

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.startsWith("multipart/form-data"))
          return json({ error: "expected_multipart_form_data" }, 400);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "invalid_multipart" }, 400);
        }

        const checklistId = String(form.get("checklist_id") ?? "").trim();
        const sessionId = String(form.get("diagnostic_session_id") ?? "").trim();
        const stage = String(form.get("test_stage") ?? "").trim();
        const claimedHash = String(form.get("sha256") ?? "")
          .trim()
          .toLowerCase();
        const agentVersion = String(form.get("agent_version") ?? "").trim() || null;
        const generatedAt = String(form.get("generated_at") ?? "").trim() || null;
        const fileEntry = form.get("file");

        if (!checklistId) return json({ error: "missing_checklist_id" }, 400);
        if (!sessionId) return json({ error: "missing_diagnostic_session_id" }, 400);
        if (!ALLOWED_STAGES.has(stage))
          return json({ error: "invalid_test_stage" }, 400);
        if (!(fileEntry instanceof File))
          return json({ error: "missing_file" }, 400);
        if (fileEntry.size > MAX_BYTES)
          return json({ error: "file_too_large", max_bytes: MAX_BYTES }, 413);
        if (fileEntry.size < 8)
          return json({ error: "file_too_small" }, 400);

        const buf = await fileEntry.arrayBuffer();
        const head = new Uint8Array(buf.slice(0, 5));
        const magic = String.fromCharCode(...head);
        if (magic !== "%PDF-") return json({ error: "not_a_pdf" }, 400);

        const realHash = await sha256HexOf(buf);
        if (claimedHash && claimedHash !== realHash)
          return json(
            { error: "hash_mismatch", expected: realHash, got: claimedHash },
            400,
          );

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const tokenHash = await sha256HexStr(key);
        const { data: token } = await supabaseAdmin
          .from("webi_integration_tokens")
          .select("id, user_id, active, expires_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (!token || !token.active) return json({ error: "invalid_token" }, 401);
        if (token.expires_at && new Date(token.expires_at) < new Date())
          return json({ error: "expired_token" }, 401);

        if (!checkRate(token.id))
          return json({ error: "rate_limited" }, 429);

        // Autoriza: checklist deve pertencer ao user do token OU user ser admin.
        // E deve ser a versão atual (is_current=true).
        const { data: chk } = await supabaseAdmin
          .from("checklists")
          .select("id, case_id, tecnico_id, is_current, status")
          .eq("id", checklistId)
          .maybeSingle();
        if (!chk) return json({ error: "checklist_not_found" }, 404);
        if (!chk.is_current)
          return json({ error: "checklist_not_current_version" }, 409);

        if (chk.tecnico_id !== token.user_id) {
          const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
            _user_id: token.user_id,
            _role: "admin",
          });
          if (!isAdmin) return json({ error: "forbidden" }, 403);
        }

        // Duplicidade por (case_id, session_id)
        const { data: dup } = await supabaseAdmin
          .from("checklist_diagnostic_reports")
          .select("id")
          .eq("case_id", chk.case_id)
          .eq("diagnostic_session_id", sessionId)
          .maybeSingle();
        if (dup)
          return json({ error: "duplicate_session", report_id: dup.id }, 409);

        // Próximo report_sequence
        const { data: lastSeq } = await supabaseAdmin
          .from("checklist_diagnostic_reports")
          .select("report_sequence")
          .eq("case_id", chk.case_id)
          .eq("test_stage", stage)
          .order("report_sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSeq = (lastSeq?.report_sequence ?? 0) + 1;

        const reportId = crypto.randomUUID();
        const safeName = sanitizeFilename(fileEntry.name || `${sessionId}.pdf`);
        const path = `${chk.case_id}/${chk.id}/${reportId}.pdf`;

        const { error: upErr } = await supabaseAdmin.storage
          .from("webi-diagnostic-reports")
          .upload(path, buf, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (upErr) return json({ error: "storage_error", detail: upErr.message }, 500);

        const { data: inserted, error: dbErr } = await supabaseAdmin
          .from("checklist_diagnostic_reports")
          .insert({
            id: reportId,
            checklist_id: chk.id,
            case_id: chk.case_id,
            diagnostic_session_id: sessionId,
            uploaded_by: token.user_id,
            original_filename: safeName,
            storage_path: path,
            sha256: realHash,
            size_bytes: fileEntry.size,
            mime_type: "application/pdf",
            agent_version: agentVersion,
            generated_at: generatedAt,
            test_stage: stage,
            report_sequence: nextSeq,
            metadata: {},
          } as never)
          .select("id, created_at")
          .single();
        if (dbErr) {
          await supabaseAdmin.storage
            .from("webi-diagnostic-reports")
            .remove([path]);
          return json({ error: "db_error", detail: dbErr.message }, 500);
        }

        await supabaseAdmin
          .from("webi_integration_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", token.id);

        return json({
          ok: true,
          report: {
            id: inserted.id,
            created_at: inserted.created_at,
            sha256: realHash,
            report_sequence: nextSeq,
          },
        });
      },
    },
  },
});
