import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REVIEW_GROUPS,
  REVIEW_ITEM_INDEX,
  groupAverage,
  overallScore,
  type ScoreMap,
} from "@/lib/technical-review-catalog";
import {
  REVIEW_GROUPS_V2,
  REVIEW_ITEM_INDEX_V2,
  groupAverageV2,
  overallScoreV2,
} from "@/lib/technical-review-catalog-v2";


/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = { from: (table: string) => any; rpc: (fn: string, args?: any) => any };
const db = (client: unknown) => client as unknown as AnyDb;

export interface ReviewListItem {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_role: string | null;
  employee_city: string | null;
  period_start: string;
  period_end: string;
  review_date: string;
  status: string;
  final_score: number | null;
  updated_at: string;
  archived_at?: string | null;
  next_review_date?: string | null;
}

async function assertAccess(context: { supabase: unknown; userId: string }) {
  const { data, error } = await db(context.supabase).rpc("has_technical_feedback_access", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito: este módulo é privado.");
}

/** Se o usuário atual enxerga o módulo (e se pode conceder acesso a outros). */
export const getTechnicalFeedbackAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: allowed }, { data: profile }, { data: isAdmin }] = await Promise.all([
      db(context.supabase).rpc("has_technical_feedback_access", { _user_id: context.userId }),
      supabaseAdmin
        .from("profiles")
        .select("platform_admin, provider_id")
        .eq("id", context.userId)
        .maybeSingle(),
      db(supabaseAdmin).rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    return {
      hasAccess: Boolean(allowed),
      canManage: Boolean(profile?.platform_admin) || Boolean(isAdmin),
      providerId: (profile?.provider_id as string | null) ?? null,
    };
  });

/** Usuários do provedor que podem ser avaliados. */
export const listEvaluableEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.provider_id) return [];
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, city")
      .eq("provider_id", me.provider_id)
      .eq("active", true)
      .order("full_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      id: p.id as string,
      full_name: (p.full_name as string) || "(sem nome)",
      city: (p.city as string | null) ?? null,
    }));
  });

export const listTechnicalReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReviewListItem[]> => {
    await assertAccess(context);
    const { data, error } = await db(context.supabase)
      .from("technical_employee_reviews")
      .select(
        "id, employee_id, employee_role, employee_city, period_start, period_end, review_date, status, final_score, updated_at, archived_at, next_review_date",
      )
      .order("period_end", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(new Set(rows.map((r) => r.employee_id))));
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
    return rows.map((r) => ({ ...r, employee_name: names.get(r.employee_id) || "(sem nome)" }));
  });

export const createTechnicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string; periodStart: string; periodEnd: string }) => {
    if (!data.employeeId) throw new Error("Selecione o colaborador avaliado.");
    if (!data.periodStart || !data.periodEnd) throw new Error("Informe o período avaliado.");
    if (data.periodEnd < data.periodStart) throw new Error("Período inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: employee } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, city")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!me?.provider_id || employee?.provider_id !== me.provider_id) {
      throw new Error("Colaborador fora do seu provedor.");
    }
    if (data.employeeId === context.userId) {
      throw new Error("Não é possível avaliar a si mesmo.");
    }
    const { data: created, error } = await db(context.supabase)
      .from("technical_employee_reviews")
      .insert({
        provider_id: me.provider_id,
        employee_id: data.employeeId,
        evaluator_user_id: context.userId,
        employee_city: employee?.city ?? null,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        // Avaliacoes novas nascem na escala 1-10 com o catalogo v2. As antigas
        // ficam com o default 1 e continuam sendo lidas em 1-5, sem conversao.
        scale_version: 2,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("technical_employee_review_audit" as never).insert({
      provider_id: me.provider_id,
      review_id: created.id,
      actor_user_id: context.userId,
      action: "create",
    } as never);
    return { id: created.id as string };
  });

export const getTechnicalReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Avaliação inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const { data: review, error } = await client
      .from("technical_employee_reviews")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!review) throw new Error("Avaliação não encontrada.");
    const [
      { data: items },
      { data: ai },
      { data: evidences },
      { data: meetings },
      { data: followups },
      { data: notes },
      { data: pdiActions },
    ] = await Promise.all([
      client.from("technical_employee_review_items").select("*").eq("review_id", data.id),
      client
        .from("technical_employee_review_ai")
        .select("*")
        .eq("review_id", data.id)
        .order("created_at", { ascending: false }),
      client
        .from("technical_employee_review_evidences")
        .select("*")
        .eq("review_id", data.id)
        .order("created_at", { ascending: false }),
      client
        .from("technical_employee_review_meetings")
        .select("*")
        .eq("review_id", data.id)
        .order("created_at", { ascending: true })
        .limit(1),
      client
        .from("technical_employee_review_followups")
        .select("*")
        .eq("review_id", data.id)
        .order("followup_date", { ascending: true }),
      client
        .from("technical_employee_notes")
        .select("*")
        .eq("employee_id", review.employee_id)
        .gte("occurred_at", `${review.period_start}T00:00:00Z`)
        .lte("occurred_at", `${review.period_end}T23:59:59Z`)
        .order("occurred_at", { ascending: false }),
      client
        .from("technical_employee_pdi_actions")
        .select("*")
        .eq("review_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee } = await supabaseAdmin
      .from("profiles")
      .select("full_name, city, email")
      .eq("id", review.employee_id)
      .maybeSingle();
    const { data: evaluator } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", review.evaluator_user_id)
      .maybeSingle();
    return {
      review: review as any,
      items: (items ?? []) as any[],
      ai: (ai ?? []) as any[],
      evidences: (evidences ?? []) as any[],
      meeting: (((meetings ?? []) as any[])[0] ?? null) as any,
      followups: (followups ?? []) as any[],
      notes: (notes ?? []) as any[],
      pdiActions: (pdiActions ?? []) as any[],
      evaluatorName: (evaluator?.full_name as string) || "",
      employee: {
        full_name: (employee?.full_name as string) || "(sem nome)",
        city: (employee?.city as string | null) ?? null,
      },
    };
  });

export interface SaveReviewInput {
  id: string;
  scores: Record<string, number | null>;
  itemNotes?: Record<string, string>;
  groupNotes?: Record<string, string>;
  strengths_notes?: string;
  development_notes?: string;
  general_notes?: string;
  development_goal?: string;
  development_action?: string;
  development_metric?: string;
  development_due_date?: string | null;
  next_review_date?: string | null;
  employee_role?: string | null;
  status?: "rascunho" | "concluida";
}

export const saveTechnicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SaveReviewInput) => {
    if (!data?.id) throw new Error("Avaliação inválida.");
    for (const [key, value] of Object.entries(data.scores ?? {})) {
      if (value == null) continue;
      const isV2Item = Boolean(REVIEW_ITEM_INDEX_V2[key]);
      if (!REVIEW_ITEM_INDEX[key] && !isV2Item)
        throw new Error(`Critério desconhecido: ${key}`);
      const max = isV2Item ? 10 : 5;
      if (!Number.isInteger(value) || value < 1 || value > max)
        throw new Error(`As notas devem ser inteiros de 1 a ${max}.`);
    }

    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const scores = (data.scores ?? {}) as ScoreMap;

    // A escala e a da avaliacao, nunca a mais nova: reabrir uma avaliacao
    // antiga nao pode recalcular a nota dela numa escala diferente.
    const { data: reviewRow } = await db(context.supabase)
      .from("technical_employee_reviews")
      .select("scale_version")
      .eq("id", data.id)
      .maybeSingle();
    const isV2 = Number((reviewRow as any)?.scale_version ?? 1) >= 2;

    const patch: Record<string, unknown> = {
      strengths_notes: data.strengths_notes ?? null,
      development_notes: data.development_notes ?? null,
      general_notes: data.general_notes ?? null,
      development_goal: data.development_goal ?? null,
      development_action: data.development_action ?? null,
      development_metric: data.development_metric ?? null,
      development_due_date: data.development_due_date || null,
      next_review_date: data.next_review_date || null,
      employee_role: data.employee_role ?? null,
      final_score: isV2 ? overallScoreV2(scores) : overallScore(scores),
    };
    // "Execucao" e "Qualidade" do catalogo v2 dividem technical_score; o loop
    // grava a media do ultimo grupo que usa a coluna, e a nota geral e sempre
    // calculada a partir dos itens, nao das colunas.
    for (const group of isV2 ? REVIEW_GROUPS_V2 : REVIEW_GROUPS) {
      patch[group.scoreColumn] = isV2
        ? groupAverageV2(group as never, scores)
        : groupAverage(group as never, scores);
      patch[group.notesColumn] = data.groupNotes?.[group.category] ?? null;
    }
    if (data.status) {
      patch.status = data.status;
      patch.feedback_completed_at = data.status === "concluida" ? new Date().toISOString() : null;
      patch.feedback_completed_by = data.status === "concluida" ? context.userId : null;
    }

    const { error: upErr } = await client
      .from("technical_employee_reviews")
      .update(patch)
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    const index = isV2 ? (REVIEW_ITEM_INDEX_V2 as never as typeof REVIEW_ITEM_INDEX) : REVIEW_ITEM_INDEX;
    const rows = Object.keys(index).map((key) => {
      const { group, item } = index[key];

      const score = scores[key];
      return {
        review_id: data.id,
        category: group.category,
        item_key: key,
        item_label: item.label,
        score: typeof score === "number" ? score : null,
        is_not_applicable: typeof score !== "number",
        observation: data.itemNotes?.[key] || null,
        updated_at: new Date().toISOString(),
      };
    });
    const { error: itemErr } = await client
      .from("technical_employee_review_items")
      .upsert(rows, { onConflict: "review_id,item_key" });
    if (itemErr) throw new Error(itemErr.message);

    return { ok: true, final_score: patch.final_score as number | null };
  });

export const deleteTechnicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Avaliação inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { error } = await db(context.supabase)
      .from("technical_employee_reviews")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Fatos da auditoria de checklists que o supervisor CONFIRMOU no período.
 * Só entram os confirmados: apontamento pendente ou rejeitado nunca vira texto
 * de feedback. Falha aqui não pode derrubar a geração — devolve lista vazia.
 */
async function loadConfirmedAuditFacts(
  employeeId: string,
  periodStart: string,
  periodEnd: string,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: analyses } = await admin
      .from("checklist_ai_analyses")
      .select("id, checklist_id, checklist_tipo")
      .eq("employee_id", employeeId)
      .eq("is_current", true)
      .gte("competence", periodStart.slice(0, 7))
      .lte("competence", periodEnd.slice(0, 7));
    if (!analyses?.length) return [];

    const byId = new Map<string, any>(analyses.map((a: any) => [a.id, a]));
    const { data: findings } = await admin
      .from("checklist_ai_findings")
      .select("analysis_id, kind, reclassified_kind, description, supervisor_note")
      .in(
        "analysis_id",
        analyses.map((a: any) => a.id),
      )
      .eq("review_status", "confirmado");
    if (!findings?.length) return [];

    const { data: checklists } = await admin
      .from("checklists")
      .select("id, cliente, cidade, finalizado_em")
      .in(
        "id",
        analyses.map((a: any) => a.checklist_id),
      );
    const checklistById = new Map<string, any>((checklists ?? []).map((c: any) => [c.id, c]));

    return (findings as any[]).map((f) => {
      const analysis = byId.get(f.analysis_id);
      const checklist = checklistById.get(analysis?.checklist_id);
      return {
        tipo: (analysis?.checklist_tipo as string) ?? "",
        data: checklist?.finalizado_em ? String(checklist.finalizado_em).slice(0, 10) : null,
        cliente: (checklist?.cliente as string | null) ?? null,
        cidade: (checklist?.cidade as string | null) ?? null,
        classificacao: (f.reclassified_kind as string | null) ?? (f.kind as string),
        fato: f.description as string,
        observacao_supervisor: (f.supervisor_note as string | null) ?? null,
      };
    });
  } catch {
    return [];
  }
}

export const runTechnicalReviewAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      type: "gerencial" | "solides" | "conversa" | "plano" | "copiloto" | "revisao" | "carta";
      tom?: "direto" | "equilibrado" | "acolhedor";
    }) => {
      if (!data?.id) throw new Error("Avaliação inválida.");
      if (
        !["gerencial", "solides", "conversa", "plano", "copiloto", "revisao", "carta"].includes(
          data.type,
        )
      )
        throw new Error("Tipo de análise inválido.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const { data: review } = await client
      .from("technical_employee_reviews")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!review) throw new Error("Avaliação não encontrada.");
    const [{ data: items }, { data: evidences }, { data: notes }, { data: pdiActions }] =
      await Promise.all([
        client.from("technical_employee_review_items").select("*").eq("review_id", data.id),
        client.from("technical_employee_review_evidences").select("*").eq("review_id", data.id),
        client
          .from("technical_employee_notes")
          .select("occurred_at, note_type, category, note_text, ai_suggested_competencies, status")
          .eq("employee_id", review.employee_id)
          .gte("occurred_at", `${review.period_start}T00:00:00Z`)
          .lte("occurred_at", `${review.period_end}T23:59:59Z`),
        client.from("technical_employee_pdi_actions").select("*").eq("review_id", data.id),
      ]);

    // Registro da conversa anterior e fatos confirmados na auditoria dos
    // checklists. Ambos alimentam a carta de feedback sem alterar a avaliação.
    const [{ data: meeting }, confirmedFacts] = await Promise.all([
      client
        .from("technical_employee_review_meetings")
        .select(
          "employee_reaction, employee_comments, supervisor_notes, agreement_status, agreed_actions",
        )
        .eq("review_id", data.id)
        .order("meeting_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadConfirmedAuditFacts(review.employee_id, review.period_start, review.period_end),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", review.employee_id)
      .maybeSingle();

    const payload = {
      colaborador: (employee?.full_name as string) || "Colaborador",
      funcao: review.employee_role ?? null,
      cidade: review.employee_city ?? null,
      periodo: `${review.period_start} a ${review.period_end}`,
      notas: REVIEW_GROUPS.map((g) => ({
        grupo: g.title,
        nota: (review[g.scoreColumn] as number | null) ?? null,
        observacao: (review[g.notesColumn] as string | null) ?? null,
      })),
      nota_geral: (review.final_score as number | null) ?? null,
      itens: ((items ?? []) as any[]).map((i) => ({
        item: i.item_label,
        nota: i.score,
        observacao: i.observation,
      })),
      pontos_fortes: review.strengths_notes ?? null,
      pontos_desenvolvimento: review.development_notes ?? null,
      observacoes: review.general_notes ?? null,
      evidencias: ((evidences ?? []) as any[]).map((e) => ({
        tipo: e.evidence_type,
        os: e.os ?? null,
        descricao: e.description ?? null,
      })),
      anotacoes_confirmadas: ((notes ?? []) as any[])
        .filter((n) => n.status === "confirmada" || n.status === "utilizada")
        .map((n) => ({
          data: n.occurred_at,
          tipo: n.note_type,
          categoria: n.category ?? null,
          texto: n.note_text,
          competencias: Array.isArray(n.ai_suggested_competencies)
            ? n.ai_suggested_competencies
            : [],
        })),
      anotacoes_em_rascunho: ((notes ?? []) as any[]).filter((n) => n.status === "rascunho").length,
      pdi_atual: ((pdiActions ?? []) as any[]).map((p) => ({
        objetivo: p.objective,
        acao: p.agreed_action,
        indicador: p.indicator,
        prazo: p.due_date ?? null,
        apoio_gestao: p.management_support ?? null,
        status: p.status,
      })),
      avaliacao_anterior: await (async () => {
        const { data: prev } = await client
          .from("technical_employee_reviews")
          .select(
            "id, period_start, period_end, final_score, strengths_notes, development_notes, development_goal, development_action, development_metric",
          )
          .eq("employee_id", review.employee_id)
          .lt("period_end", review.period_start)
          .order("period_end", { ascending: false })
          .limit(1)
          .maybeSingle();
        return prev
          ? {
              periodo: `${prev.period_start} a ${prev.period_end}`,
              nota_geral: prev.final_score as number | null,
              pontos_fortes: prev.strengths_notes,
              desenvolvimento: prev.development_notes,
              pdi_anterior: {
                objetivo: prev.development_goal,
                acao: prev.development_action,
                indicador: prev.development_metric,
              },
            }
          : null;
      })(),
      fatos_auditoria: confirmedFacts,
      conversa: meeting
        ? {
            reacao: (meeting.employee_reaction as string | null) ?? null,
            comentarios_do_tecnico: (meeting.employee_comments as string | null) ?? null,
            concordancia: (meeting.agreement_status as string | null) ?? null,
            acoes_combinadas: (meeting.agreed_actions as string | null) ?? null,
            notas_do_supervisor: (meeting.supervisor_notes as string | null) ?? null,
          }
        : null,
      tom: data.tom,
    };

    const { generateReviewAi } = await import("@/lib/technical-review-ai.server");
    const { content, model } = await generateReviewAi(data.type, payload);

    const { data: saved, error } = await client
      .from("technical_employee_review_ai")
      .insert({
        review_id: data.id,
        analysis_type: data.type,
        content,
        options: { tom: data.tom ?? "equilibrado" },
        input_snapshot: payload,
        model,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as any;
  });

/* ---------- Gestão de acesso ao módulo (admin do provedor / dono) ---------- */

export const listTechnicalFeedbackAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: isAdmin } = await db(supabaseAdmin).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!me?.platform_admin && !isAdmin) throw new Error("Acesso restrito.");
    let q = db(supabaseAdmin)
      .from("technical_feedback_access")
      .select("id, user_id, provider_id, created_at");
    if (!me?.platform_admin) q = q.eq("provider_id", me?.provider_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        rows.map((r) => r.user_id),
      );
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      full_name: (map.get(r.user_id)?.full_name as string) || "(sem nome)",
      email: (map.get(r.user_id)?.email as string) || "",
    }));
  });

export const setTechnicalFeedbackAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; allow: boolean }) => {
    if (!data?.userId) throw new Error("Usuário inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: isAdmin } = await db(supabaseAdmin).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!me?.platform_admin && !isAdmin) throw new Error("Acesso restrito.");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("provider_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target?.provider_id) throw new Error("Usuário sem provedor.");
    if (!me?.platform_admin && target.provider_id !== me?.provider_id)
      throw new Error("Usuário de outro provedor.");

    if (data.allow) {
      const { error } = await db(supabaseAdmin).from("technical_feedback_access").upsert(
        {
          provider_id: target.provider_id,
          user_id: data.userId,
          granted_by: context.userId,
        },
        { onConflict: "provider_id,user_id" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db(supabaseAdmin)
        .from("technical_feedback_access")
        .delete()
        .eq("user_id", data.userId)
        .eq("provider_id", target.provider_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ---------- Evidências, reunião de feedback, acompanhamentos e histórico ---------- */

async function loadReview(context: { supabase: unknown }, id: string) {
  const { data: review, error } = await db(context.supabase)
    .from("technical_employee_reviews")
    .select("id, provider_id, employee_id, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!review) throw new Error("Avaliação não encontrada.");
  return review as {
    id: string;
    provider_id: string;
    employee_id: string;
    period_start: string;
    period_end: string;
  };
}

/** Checklists do colaborador dentro do período avaliado (para virar evidência). */
export const listReviewCandidateChecklists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Avaliação inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const review = await loadReview(context, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await db(supabaseAdmin)
      .from("checklists")
      .select(
        "id, tipo, os, cliente, cidade, status, numero_publico, rmap_code, intervention_code, created_at",
      )
      .eq("provider_id", review.provider_id)
      .eq("tecnico_id", review.employee_id)
      .gte("created_at", `${review.period_start}T00:00:00Z`)
      .lte("created_at", `${review.period_end}T23:59:59Z`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as any[]).map((c) => ({
      id: c.id as string,
      tipo: c.tipo as string,
      os: (c.os as string | null) ?? null,
      cliente: (c.cliente as string | null) ?? null,
      cidade: (c.cidade as string | null) ?? null,
      status: c.status as string,
      codigo: (c.rmap_code || c.intervention_code || c.numero_publico || null) as string | null,
      created_at: c.created_at as string,
    }));
  });

export const addReviewEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      evidenceType: string;
      checklistId?: string | null;
      os?: string | null;
      description?: string | null;
    }) => {
      if (!data?.id) throw new Error("Avaliação inválida.");
      if (!data.evidenceType) throw new Error("Informe o tipo de evidência.");
      if (!data.checklistId && !data.os && !data.description)
        throw new Error("Descreva a evidência ou vincule um checklist.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { data: saved, error } = await db(context.supabase)
      .from("technical_employee_review_evidences")
      .insert({
        review_id: data.id,
        evidence_type: data.evidenceType,
        checklist_id: data.checklistId || null,
        os: data.os || null,
        description: data.description || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as any;
  });

const REVIEW_EVIDENCE_BUCKET = "review-evidences";
const EVIDENCE_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

/** Assinaturas reais — o MIME declarado pelo cliente não prova nada. */
function evidenceContentMatches(mime: string, b: Uint8Array): boolean {
  if (b.byteLength < 12) return false;
  if (mime === "image/png")
    return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/webp")
    return (
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
    );
  if (mime === "application/pdf")
    return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  return false;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Anexa uma evidência do período que não veio de checklist: print do Zumme,
 * foto, documento. Fica vinculada à avaliação e entra no PDF.
 */
export const uploadReviewEvidenceFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      name: string;
      mime: string;
      dataBase64: string;
      description?: string;
      occurredOn?: string | null;
    }) => {
      if (!data?.id) throw new Error("Avaliação inválida.");
      if (!EVIDENCE_ALLOWED_MIME.includes(data?.mime))
        throw new Error("Formato não permitido. Use PNG, JPG, WEBP ou PDF.");
      if (!data?.dataBase64) throw new Error("Arquivo vazio.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const review = await loadReview(context, data.id);
    const bytes = base64ToBytes(data.dataBase64);
    if (bytes.byteLength === 0) throw new Error("Arquivo vazio.");
    if (bytes.byteLength > EVIDENCE_MAX_BYTES) throw new Error("Arquivo acima de 8 MB.");
    if (!evidenceContentMatches(data.mime, bytes))
      throw new Error("O conteúdo do arquivo não corresponde ao formato informado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName =
      (data.name || "evidencia").split(/[\\/]/).pop()?.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) ||
      "evidencia";
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
    const path = `${review.id}/${crypto.randomUUID()}.${(ext ?? "bin").toLowerCase().slice(0, 8)}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from(REVIEW_EVIDENCE_BUCKET)
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (upErr) throw new Error("Não foi possível anexar a evidência.");

    const { data: created, error } = await db(context.supabase)
      .from("technical_employee_review_evidences")
      .insert({
        review_id: review.id,
        evidence_type: data.mime === "application/pdf" ? "documento" : "imagem",
        description: data.description?.slice(0, 500) ?? null,
        storage_path: path,
        display_name: safeName,
        mime_type: data.mime,
        size_bytes: bytes.byteLength,
        occurred_on: data.occurredOn || null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

/** URL assinada de curta duração, só depois de confirmar a posse da avaliação. */
export const getReviewEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { evidenceId: string }) => {
    if (!data?.evidenceId) throw new Error("Evidência inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    // A RLS de technical_employee_review_evidences já exige owns_technical_review:
    // se a evidência não for de uma avaliação do supervisor, não volta linha.
    const { data: evidence } = await db(context.supabase)
      .from("technical_employee_review_evidences")
      .select("storage_path, mime_type, display_name")
      .eq("id", data.evidenceId)
      .maybeSingle();
    if (!evidence?.storage_path) throw new Error("Evidência não encontrada.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from(REVIEW_EVIDENCE_BUCKET)
      .createSignedUrl(evidence.storage_path as string, 300);
    if (!signed?.signedUrl) throw new Error("Não foi possível abrir a evidência.");
    return {
      url: signed.signedUrl as string,
      mime: evidence.mime_type as string | null,
      name: evidence.display_name as string | null,
    };
  });

export const removeReviewEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { evidenceId: string }) => {
    if (!data?.evidenceId) throw new Error("Evidência inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { error } = await db(context.supabase)
      .from("technical_employee_review_evidences")
      .delete()
      .eq("id", data.evidenceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface MeetingInput {
  id: string;
  meetingDate: string;
  meetingPlace?: string | null;
  employeeReaction?: string | null;
  employeeComments?: string | null;
  supervisorNotes?: string | null;
  newInformationPresented?: boolean;
  newInformation?: string | null;
  feedbackRealized?: boolean;
  agreementStatus?: string | null;
  agreedActions?: string | null;
  nextReviewDate?: string | null;
}

/** Registra (ou atualiza) a conversa de feedback com o colaborador. */
export const saveReviewMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: MeetingInput) => {
    if (!data?.id) throw new Error("Avaliação inválida.");
    if (!data.meetingDate) throw new Error("Informe a data da conversa.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const payload = {
      review_id: data.id,
      meeting_date: new Date(data.meetingDate).toISOString(),
      meeting_place: data.meetingPlace || null,
      employee_reaction: data.employeeReaction || null,
      employee_comments: data.employeeComments || null,
      supervisor_notes: data.supervisorNotes || null,
      new_information_presented: Boolean(data.newInformationPresented),
      new_information: data.newInformation || null,
      feedback_realized: Boolean(data.feedbackRealized),
      agreement_status: data.agreementStatus || null,
      agreed_actions: data.agreedActions || null,
      next_review_date: data.nextReviewDate || null,
      created_by: context.userId,
    };
    const { data: existing } = await client
      .from("technical_employee_review_meetings")
      .select("id")
      .eq("review_id", data.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await client
        .from("technical_employee_review_meetings")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: existing.id as string };
    }
    const { data: created, error } = await client
      .from("technical_employee_review_meetings")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id as string };
  });

export const saveReviewFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      followupId?: string | null;
      followupDate: string;
      status: string;
      previousGoal?: string | null;
      result?: string | null;
      observation?: string | null;
    }) => {
      if (!data?.id) throw new Error("Avaliação inválida.");
      if (!data.followupDate) throw new Error("Informe a data do acompanhamento.");
      if (!["pendente", "em_andamento", "atingido", "nao_atingido"].includes(data.status))
        throw new Error("Situação inválida.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const payload = {
      review_id: data.id,
      followup_date: data.followupDate,
      status: data.status,
      previous_goal: data.previousGoal || null,
      result: data.result || null,
      observation: data.observation || null,
      created_by: context.userId,
    };
    if (data.followupId) {
      const { error } = await client
        .from("technical_employee_review_followups")
        .update(payload)
        .eq("id", data.followupId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.followupId };
    }
    const { data: created, error } = await client
      .from("technical_employee_review_followups")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id as string };
  });

export const deleteReviewFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { followupId: string }) => {
    if (!data?.followupId) throw new Error("Acompanhamento inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { error } = await db(context.supabase)
      .from("technical_employee_review_followups")
      .delete()
      .eq("id", data.followupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setReviewArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; archived: boolean }) => {
    if (!data?.id) throw new Error("Avaliação inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { error } = await db(context.supabase)
      .from("technical_employee_reviews")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Histórico do colaborador para comparar a evolução entre avaliações. */
export const getEmployeeReviewHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string }) => {
    if (!data?.employeeId) throw new Error("Colaborador inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { data: rows, error } = await db(context.supabase)
      .from("technical_employee_reviews")
      .select(
        "id, period_start, period_end, status, final_score, technical_score, recurrence_score, evidence_score, productivity_score, operational_score, communication_score, archived_at",
      )
      .eq("employee_id", data.employeeId)
      .order("period_end", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

/* ---------- Anotações mensais privadas ---------- */

const NOTE_TYPES = [
  "positivo",
  "atencao",
  "desenvolvimento",
  "destaque",
  "tecnico",
  "atendimento",
  "comunicacao",
  "operacional",
] as const;
const NOTE_STATUSES = ["rascunho", "confirmada", "utilizada", "arquivada"] as const;

export const saveTechnicalEmployeeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      reviewId?: string | null;
      employeeId?: string | null;
      noteId?: string | null;
      occurredAt: string;
      noteText: string;
      noteType: (typeof NOTE_TYPES)[number];
      category?: string | null;
      status: (typeof NOTE_STATUSES)[number];
      checklistId?: string | null;
      serviceOrder?: string | null;
    }) => {
      if (!data.reviewId && !data.employeeId) throw new Error("Selecione o colaborador.");
      if (!data.noteText || data.noteText.trim().length < 3)
        throw new Error("Escreva uma anotação com pelo menos 3 caracteres.");
      if (!NOTE_TYPES.includes(data.noteType)) throw new Error("Tipo de anotação inválido.");
      if (!NOTE_STATUSES.includes(data.status)) throw new Error("Status de anotação inválido.");
      if (!data.occurredAt || Number.isNaN(new Date(data.occurredAt).getTime()))
        throw new Error("Data da anotação inválida.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    let providerId: string;
    let employeeId: string;
    if (data.reviewId) {
      const review = await loadReview(context, data.reviewId);
      providerId = review.provider_id;
      employeeId = review.employee_id;
    } else {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Sem employeeId não há a quem vincular a anotação; checar antes de
      // consultar evita passar undefined para o filtro do PostgREST.
      if (!data.employeeId) throw new Error("Informe o colaborador da anotação.");
      const [{ data: me }, { data: employee }] = await Promise.all([
        supabaseAdmin.from("profiles").select("provider_id").eq("id", context.userId).maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("provider_id")
          .eq("id", data.employeeId)
          .maybeSingle(),
      ]);
      if (!me?.provider_id || employee?.provider_id !== me.provider_id)
        throw new Error("Colaborador fora do seu provedor.");
      if (data.employeeId === context.userId)
        throw new Error("Não registre anotações sobre si mesmo.");
      providerId = me.provider_id as string;
      employeeId = data.employeeId as string;
    }
    const occurredAt = new Date(data.occurredAt).toISOString();
    const competence = occurredAt.slice(0, 7);
    const payload = {
      provider_id: providerId,
      employee_id: employeeId,
      author_user_id: context.userId,
      occurred_at: occurredAt,
      competence,
      note_text: data.noteText.trim(),
      note_type: data.noteType,
      category: data.category?.trim() || null,
      status: data.status,
      linked_review_id: data.status === "utilizada" ? data.reviewId || null : null,
      checklist_id: data.checklistId || null,
      service_order: data.serviceOrder?.trim() || null,
    };
    const client = db(context.supabase);
    if (data.noteId) {
      const { data: saved, error } = await client
        .from("technical_employee_notes")
        .update(payload)
        .eq("id", data.noteId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return saved as any;
    }
    const { data: saved, error } = await client
      .from("technical_employee_notes")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as any;
  });

export const listMonthlyTechnicalEmployeeNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { competence: string; employeeId?: string | null }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.competence)) throw new Error("Competência inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    let query = db(context.supabase)
      .from("technical_employee_notes")
      .select("*")
      .eq("competence", data.competence)
      .order("occurred_at", { ascending: false });
    if (data.employeeId) query = query.eq("employee_id", data.employeeId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    if (!list.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(new Set(list.map((row) => row.employee_id))));
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
    return list.map((row) => ({
      ...row,
      employee_name: names.get(row.employee_id) || "(sem nome)",
    }));
  });

export const deleteTechnicalEmployeeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { noteId: string }) => {
    if (!data.noteId) throw new Error("Anotação inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { error } = await db(context.supabase)
      .from("technical_employee_notes")
      .delete()
      .eq("id", data.noteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const analyzeTechnicalEmployeeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { noteId: string }) => {
    if (!data.noteId) throw new Error("Anotação inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const { data: note, error: noteError } = await client
      .from("technical_employee_notes")
      .select("id, note_text")
      .eq("id", data.noteId)
      .maybeSingle();
    if (noteError) throw new Error(noteError.message);
    if (!note) throw new Error("Anotação não encontrada.");
    const { analyzeTechnicalEmployeeNote: analyze } =
      await import("@/lib/technical-review-ai.server");
    const result = await analyze(String(note.note_text));
    const { data: saved, error } = await client
      .from("technical_employee_notes")
      .update({
        ai_suggested_type: result.suggestedType,
        ai_suggested_category: result.suggestedCategory || null,
        ai_suggested_competencies: result.competencies,
        ai_professional_text: result.professionalText || null,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq("id", data.noteId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as any;
  });

/* ---------- PDI estruturado ---------- */

const PDI_STATUSES = [
  "nao_iniciado",
  "em_andamento",
  "cumprido",
  "parcialmente_cumprido",
  "nao_cumprido",
  "cancelado",
] as const;

export const saveTechnicalPdiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      reviewId: string;
      actionId?: string | null;
      objective: string;
      agreedAction: string;
      indicator: string;
      dueDate?: string | null;
      managementSupport?: string | null;
      status: (typeof PDI_STATUSES)[number];
      followupComment?: string | null;
      source?: "manual" | "ia";
    }) => {
      if (!data.reviewId) throw new Error("Avaliação inválida.");
      if (!data.objective?.trim() || !data.agreedAction?.trim() || !data.indicator?.trim())
        throw new Error("Informe objetivo, ação combinada e indicador.");
      if (!PDI_STATUSES.includes(data.status)) throw new Error("Status do PDI inválido.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const review = await loadReview(context, data.reviewId);
    const client = db(context.supabase);
    if (!data.actionId) {
      const { count, error: countError } = await client
        .from("technical_employee_pdi_actions")
        .select("id", { count: "exact", head: true })
        .eq("review_id", data.reviewId);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= 4) throw new Error("O PDI pode ter no máximo 4 ações prioritárias.");
    }
    const payload = {
      review_id: data.reviewId,
      provider_id: review.provider_id,
      employee_id: review.employee_id,
      evaluator_user_id: context.userId,
      objective: data.objective.trim(),
      agreed_action: data.agreedAction.trim(),
      indicator: data.indicator.trim(),
      due_date: data.dueDate || null,
      management_support: data.managementSupport?.trim() || null,
      status: data.status,
      followup_comment: data.followupComment?.trim() || null,
      source: data.source ?? "manual",
    };
    if (data.actionId) {
      const { data: saved, error } = await client
        .from("technical_employee_pdi_actions")
        .update(payload)
        .eq("id", data.actionId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return saved as any;
    }
    const { data: saved, error } = await client
      .from("technical_employee_pdi_actions")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved as any;
  });

export const deleteTechnicalPdiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { actionId: string }) => {
    if (!data.actionId) throw new Error("Ação de PDI inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const { error } = await db(context.supabase)
      .from("technical_employee_pdi_actions")
      .delete()
      .eq("id", data.actionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
