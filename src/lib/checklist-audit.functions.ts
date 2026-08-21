import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isAuditableTipo,
  isWithinRubric,
  RUBRIC_VALID_FROM,
  RUBRIC_VERSION,
  type AuditTipo,
} from "@/lib/checklist-audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Ctx = { supabase: any; userId: string };

/** Quantos checklists por chamada. A tela repete até terminar (pausa = parar de pedir). */
const BATCH_SIZE = 5;

async function assertAccess(context: Ctx) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: allowed } = await db.rpc("has_technical_feedback_access", {
    _user_id: context.userId,
  });
  if (!allowed) throw new Error("Acesso restrito ao módulo de avaliação técnica.");
  const { data: profile } = await db
    .from("profiles")
    .select("provider_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.provider_id) throw new Error("Perfil sem provedor vinculado.");
  return { db, providerId: profile.provider_id as string };
}

export interface AuditFilters {
  employeeId: string;
  dateFrom: string;
  dateTo: string;
  tipos?: string[];
  onlyFinalized?: boolean;
}

function validateFilters(data: AuditFilters): AuditFilters {
  if (!data?.employeeId) throw new Error("Selecione o técnico.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dateFrom ?? "")) throw new Error("Data inicial inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dateTo ?? "")) throw new Error("Data final inválida.");
  if (data.dateFrom > data.dateTo) throw new Error("A data inicial é maior que a final.");
  return data;
}

/** Busca os checklists elegíveis: finalizados, do técnico, dentro da vigência. */
async function findEligible(db: any, providerId: string, f: AuditFilters) {
  // A rubrica só vale de RUBRIC_VALID_FROM em diante; não audita antes disso.
  const from = f.dateFrom < RUBRIC_VALID_FROM ? RUBRIC_VALID_FROM : f.dateFrom;
  let q = db
    .from("checklists")
    .select("id, tipo, os, cliente, cidade, status, revision_number, finalizado_em, numero_publico, rmap_code, intervention_code")
    .eq("provider_id", providerId)
    .eq("tecnico_id", f.employeeId)
    .eq("status", "finalizado")
    .gte("finalizado_em", `${from}T00:00:00Z`)
    .lte("finalizado_em", `${f.dateTo}T23:59:59Z`)
    .order("finalizado_em", { ascending: true })
    .limit(500);
  if (f.tipos?.length) q = q.in("tipo", f.tipos);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).filter(
    (c) => isAuditableTipo(c.tipo) && isWithinRubric(c.finalizado_em),
  );
}

/* ---------------------------------------------------------------- prévia */

/** Conta o que será processado sem gastar uma única chamada de IA. */
export const previewChecklistAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFilters)
  .handler(async ({ data, context }) => {
    const { db, providerId } = await assertAccess(context as Ctx);
    const eligible = await findEligible(db, providerId, data);

    const ids = eligible.map((c) => c.id);
    const analyzed = ids.length
      ? ((
          await db
            .from("checklist_ai_analyses")
            .select("checklist_id")
            .in("checklist_id", ids)
            .eq("is_current", true)
            .eq("rubric_version", RUBRIC_VERSION)
        ).data ?? [])
      : [];
    const analyzedIds = new Set(analyzed.map((a: any) => a.checklist_id));

    const porTipo: Record<string, number> = {};
    for (const c of eligible) porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;

    const pendentes = eligible.filter((c) => !analyzedIds.has(c.id)).length;
    return {
      rubricVersion: RUBRIC_VERSION,
      rubricValidFrom: RUBRIC_VALID_FROM,
      // Avisa quando o período pedido é anterior à vigência da rubrica.
      truncatedTo: data.dateFrom < RUBRIC_VALID_FROM ? RUBRIC_VALID_FROM : null,
      total: eligible.length,
      jaAnalisados: eligible.length - pendentes,
      pendentes,
      porTipo,
      // ~6s por checklist, processando BATCH_SIZE por rodada.
      estimativaSegundos: Math.ceil(pendentes * 6),
      amostra: eligible.slice(0, 8).map((c) => ({
        id: c.id,
        tipo: c.tipo,
        cliente: c.cliente,
        codigo: c.rmap_code || c.intervention_code || c.numero_publico,
        finalizado_em: c.finalizado_em,
      })),
    };
  });

/* ------------------------------------------------------------------ lote */

export const startChecklistAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateFilters)
  .handler(async ({ data, context }) => {
    const { db, providerId } = await assertAccess(context as Ctx);
    const eligible = await findEligible(db, providerId, data);
    const { data: batch, error } = await db
      .from("checklist_audit_batches")
      .insert({
        provider_id: providerId,
        employee_id: data.employeeId,
        filters: data,
        status: "executando",
        total_checklists: eligible.length,
        started_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return batch;
  });

/**
 * Processa até BATCH_SIZE checklists e devolve o progresso. A tela chama de
 * novo enquanto `remaining > 0`; pausar é simplesmente parar de chamar.
 */
export const runChecklistAuditBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchId: string }) => {
    if (!data?.batchId) throw new Error("Lote inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { db, providerId } = await assertAccess(context as Ctx);

    const { data: batch } = await db
      .from("checklist_audit_batches")
      .select("*")
      .eq("id", data.batchId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!batch) throw new Error("Lote não encontrado.");
    if (batch.status === "cancelado") return { done: true, batch, remaining: 0 };

    const filters = batch.filters as AuditFilters;
    const eligible = await findEligible(db, providerId, filters);

    const ids = eligible.map((c) => c.id);
    const done = ids.length
      ? ((
          await db
            .from("checklist_ai_analyses")
            .select("checklist_id")
            .in("checklist_id", ids)
            .eq("is_current", true)
            .eq("rubric_version", RUBRIC_VERSION)
        ).data ?? [])
      : [];
    const doneIds = new Set(done.map((a: any) => a.checklist_id));
    const queue = eligible.filter((c) => !doneIds.has(c.id)).slice(0, BATCH_SIZE);

    const { analyzeChecklist, computeContentHash } = await import("@/lib/checklist-audit.server");

    let processed = 0;
    let failed = 0;
    let skipped = 0;
    let lastError: string | null = null;

    for (const checklist of queue) {
      try {
        const { data: full } = await db
          .from("checklists")
          .select("id, tipo, dados, cidade, data_atendimento, revision_number, finalizado_em, tecnico_id")
          .eq("id", checklist.id)
          .maybeSingle();
        if (!full) continue;

        const { data: fotos } = await db
          .from("checklist_fotos")
          .select("categoria")
          .eq("checklist_id", checklist.id);
        const fotoCategorias: string[] = Array.from(
          new Set((fotos ?? []).map((f: any) => String(f.categoria))),
        );

        const hash = await computeContentHash({
          checklistId: full.id,
          revisionNumber: full.revision_number ?? 1,
          rubricVersion: RUBRIC_VERSION,
          dados: full.dados,
          fotoCategorias,
        });

        // Já existe análise idêntica: nada mudou, não gasta IA de novo.
        const { data: dup } = await db
          .from("checklist_ai_analyses")
          .select("id")
          .eq("content_hash", hash)
          .maybeSingle();
        if (dup) {
          skipped++;
          continue;
        }

        const result = await analyzeChecklist({
          tipo: full.tipo as AuditTipo,
          dados: full.dados,
          fotoCategorias,
          contexto: {
            tipo: full.tipo,
            cidade: full.cidade ?? null,
            data_atendimento: full.data_atendimento ?? null,
            revisao: full.revision_number ?? 1,
          },
        });

        // A análise anterior nunca é apagada: perde o is_current e fica no
        // histórico, conforme o §4 do escopo.
        await db
          .from("checklist_ai_analyses")
          .update({ is_current: false, status: "reprocessado" })
          .eq("checklist_id", full.id)
          .eq("is_current", true);

        const competence = String(full.finalizado_em ?? "").slice(0, 7);
        const { data: analysis, error: insErr } = await db
          .from("checklist_ai_analyses")
          .insert({
            provider_id: providerId,
            checklist_id: full.id,
            employee_id: full.tecnico_id,
            competence,
            checklist_tipo: full.tipo,
            revision_number: full.revision_number ?? 1,
            rubric_version: RUBRIC_VERSION,
            content_hash: hash,
            status: result.status,
            is_current: true,
            confidence: result.confidence,
            model: result.model,
            raw_response: (result.raw ?? null) as any,
            error_message: result.error ?? null,
            analyzed_at: new Date().toISOString(),
            batch_id: batch.id,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);

        if (result.findings.length) {
          await db.from("checklist_ai_findings").insert(
            result.findings.map((f) => ({
              analysis_id: analysis.id,
              kind: f.kind,
              category: f.category,
              description: f.description,
              refs: f.refs,
              confidence: f.confidence,
              origin: f.origin,
            })),
          );
        }
        processed++;
        if (result.status !== "analisado") failed++;
      } catch (e) {
        failed++;
        lastError = (e as Error).message;
      }
    }

    const remaining = Math.max(0, eligible.filter((c) => !doneIds.has(c.id)).length - queue.length);
    const finished = remaining === 0;

    const { data: updated } = await db
      .from("checklist_audit_batches")
      .update({
        processed: (batch.processed ?? 0) + processed,
        skipped_duplicate: (batch.skipped_duplicate ?? 0) + skipped,
        failed: (batch.failed ?? 0) + failed,
        last_error: lastError,
        status: finished ? "concluido" : "executando",
        finished_at: finished ? new Date().toISOString() : null,
      })
      .eq("id", batch.id)
      .select("*")
      .single();

    return { done: finished, remaining, batch: updated ?? batch };
  });

export const pauseChecklistAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchId: string; status: "pausado" | "executando" | "cancelado" }) => {
    if (!data?.batchId) throw new Error("Lote inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { db, providerId } = await assertAccess(context as Ctx);
    const { data: updated, error } = await db
      .from("checklist_audit_batches")
      .update({ status: data.status })
      .eq("id", data.batchId)
      .eq("provider_id", providerId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

/* --------------------------------------------------- leitura e revisão */

/** Apontamentos de um técnico numa competência, com o checklist de origem. */
export const listChecklistFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string; competence?: string }) => {
    if (!data?.employeeId) throw new Error("Técnico inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { db, providerId } = await assertAccess(context as Ctx);
    let q = db
      .from("checklist_ai_analyses")
      .select("*")
      .eq("provider_id", providerId)
      .eq("employee_id", data.employeeId)
      .eq("is_current", true)
      .order("analyzed_at", { ascending: false });
    if (data.competence) q = q.eq("competence", data.competence);
    const { data: analyses, error } = await q;
    if (error) throw new Error(error.message);
    if (!analyses?.length) return { analyses: [], findings: [], checklists: [] };

    const analysisIds = analyses.map((a: any) => a.id);
    const checklistIds = analyses.map((a: any) => a.checklist_id);

    const [{ data: findings }, { data: checklists }] = await Promise.all([
      db
        .from("checklist_ai_findings")
        .select("*")
        .in("analysis_id", analysisIds)
        .order("created_at", { ascending: true }),
      db
        .from("checklists")
        .select("id, tipo, os, cliente, cidade, finalizado_em, numero_publico, rmap_code, intervention_code")
        .in("id", checklistIds),
    ]);

    return { analyses, findings: findings ?? [], checklists: checklists ?? [] };
  });

/** Confirmar, rejeitar, reclassificar ou marcar que não era responsabilidade. */
export const reviewChecklistFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      findingId: string;
      reviewStatus: "pendente" | "confirmado" | "rejeitado" | "nao_era_responsabilidade";
      reclassifiedKind?: string | null;
      supervisorNote?: string | null;
    }) => {
      if (!data?.findingId) throw new Error("Apontamento inválido.");
      if (
        !["pendente", "confirmado", "rejeitado", "nao_era_responsabilidade"].includes(
          data.reviewStatus,
        )
      )
        throw new Error("Situação de revisão inválida.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { db } = await assertAccess(context as Ctx);
    const { data: updated, error } = await db
      .from("checklist_ai_findings")
      .update({
        review_status: data.reviewStatus,
        reclassified_kind: data.reclassifiedKind ?? null,
        supervisor_note: data.supervisorNote?.slice(0, 2000) ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.findingId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });
