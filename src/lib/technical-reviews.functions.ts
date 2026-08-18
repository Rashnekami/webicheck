import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REVIEW_GROUPS,
  REVIEW_ITEM_INDEX,
  groupAverage,
  overallScore,
  type ScoreMap,
} from "@/lib/technical-review-catalog";

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
        "id, employee_id, employee_role, employee_city, period_start, period_end, review_date, status, final_score, updated_at",
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
    const [{ data: items }, { data: ai }, { data: evidences }, { data: meetings }, { data: followups }] =
      await Promise.all([
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
      if (!REVIEW_ITEM_INDEX[key]) throw new Error(`Critério desconhecido: ${key}`);
      if (!Number.isInteger(value) || value < 1 || value > 5)
        throw new Error("As notas devem ser inteiros de 1 a 5.");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAccess(context);
    const client = db(context.supabase);
    const scores = (data.scores ?? {}) as ScoreMap;

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
      final_score: overallScore(scores),
    };
    for (const group of REVIEW_GROUPS) {
      patch[group.scoreColumn] = groupAverage(group, scores);
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

    const rows = Object.keys(REVIEW_ITEM_INDEX).map((key) => {
      const { group, item } = REVIEW_ITEM_INDEX[key];
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

export const runTechnicalReviewAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      type: "gerencial" | "solides" | "conversa" | "plano";
      tom?: "direto" | "equilibrado" | "acolhedor";
    }) => {
      if (!data?.id) throw new Error("Avaliação inválida.");
      if (!["gerencial", "solides", "conversa", "plano"].includes(data.type))
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
    const [{ data: items }, { data: evidences }] = await Promise.all([
      client.from("technical_employee_review_items").select("*").eq("review_id", data.id),
      client.from("technical_employee_review_evidences").select("*").eq("review_id", data.id),
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
      .in("id", rows.map((r) => r.user_id));
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
      const { error } = await db(supabaseAdmin)
        .from("technical_feedback_access")
        .upsert(
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
      .select("id, tipo, os, cliente, cidade, status, numero_publico, rmap_code, intervention_code, created_at")
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
