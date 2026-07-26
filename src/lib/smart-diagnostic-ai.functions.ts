import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptyChecklistData } from "@/lib/checklist-schema";
import type { SmartDiagnosticSession } from "@/lib/smart-diagnostic";
import type { AiReviewMode } from "@/lib/smart-diagnostic-ai";
import type { AiGatewayProvider } from "@/lib/ai-gateway.server";

const sessionInputSchema = z
  .object({
    id: z.string().uuid(),
    engineVersion: z.string().min(2).max(80),
    metadata: z.object({
      client: z.string().max(300),
      workOrder: z.string().max(120),
      city: z.string().max(120),
      otherSymptom: z.string().max(1_000),
      serviceType: z.literal("manutencao"),
      linkedChecklistCode: z.string().max(100),
      equipmentModel: z.string().max(180),
    }).passthrough(),
    symptoms: z.array(z.string()).max(40),
    answers: z.record(z.unknown()),
    history: z.array(z.string()).max(200),
    events: z.array(z.unknown()).max(200),
    startedAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

function validateSession(value: unknown): SmartDiagnosticSession {
  return sessionInputSchema.parse(value) as SmartDiagnosticSession;
}

/**
 * Ponte do Diagnóstico Inteligente para o fluxo já homologado de checklist/ONT.
 * Não cria ticket nem código próprio: cria a revisão rascunho do checklist e o
 * trigger existente gera o código TYYYYNN quando a troca for efetivamente
 * finalizada no mesmo formulário que o almoxarifado já utiliza.
 */
export const createDiagnosticOntExchangeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    checklistCode: string;
    exchangeReasons: string[];
    notes?: string;
    nocProtocol: string;
    nocAnalyst?: string;
    diagnosisSummary: string;
  }) => ({
    checklistCode: z.string().trim().regex(/^[A-Za-z0-9_-]{4,100}$/).parse(data.checklistCode),
    exchangeReasons: z.array(z.string().trim().min(2).max(180)).min(1).max(12).parse(data.exchangeReasons),
    notes: z.string().max(2_000).optional().parse(data.notes),
    nocProtocol: z.string().trim().min(2).max(180).parse(data.nocProtocol),
    nocAnalyst: z.string().max(180).optional().parse(data.nocAnalyst),
    diagnosisSummary: z.string().trim().min(3).max(2_000).parse(data.diagnosisSummary),
  }))
  .handler(async ({ context, data }) => {
    const { data: providerId, error: providerError } = await context.supabase.rpc("current_provider_id");
    if (providerError || !providerId) throw new Error("Provedor do usuário não encontrado.");

    const baseCode = data.checklistCode.replace(/-R\d+$/i, "");
    const { data: candidates, error: checklistError } = await context.supabase
      .from("checklists")
      .select("id, case_id, status, is_current, revision_number")
      .eq("provider_id", providerId)
      .or(`numero_publico.eq.${baseCode},codigo_validacao.eq.${baseCode}`)
      .order("revision_number", { ascending: false });
    if (checklistError) throw new Error(checklistError.message);
    const current = (candidates ?? []).find((item) => item.is_current !== false);
    if (!current) throw new Error("Checklist técnico vinculado não encontrado neste provedor.");

    // Um rascunho já aberto é retomado; nunca criamos uma segunda revisão do mesmo atendimento.
    if (current.status === "rascunho") {
      return { id: current.id, revisionNumber: current.revision_number, resumed: true };
    }
    if (current.status !== "finalizado") {
      throw new Error("O checklist vinculado precisa estar finalizado antes de abrir a troca.");
    }

    const reason = `Troca de ONT indicada pelo Diagnóstico Inteligente: ${data.exchangeReasons.join(", ")}`;
    const { data: revision, error: revisionError } = await context.supabase.rpc(
      "create_checklist_revision",
      {
        _parent_id: current.id,
        _reason: reason.slice(0, 500),
        _stage: "pre_change",
        _notes: [data.diagnosisSummary, data.notes?.trim()].filter(Boolean).join("\n\n").slice(0, 2_000),
      },
    );
    if (revisionError) throw new Error(revisionError.message);
    const created = Array.isArray(revision) ? revision[0] : revision;
    if (!created?.id) throw new Error("Não foi possível criar o rascunho de troca.");

    const now = new Date();
    const checklistData = emptyChecklistData();
    checklistData.resultado_final = {
      ...checklistData.resultado_final,
      permaneceu: true,
      motivo: data.exchangeReasons.join("; "),
    };
    checklistData.relato = [
      "Diagnóstico Inteligente — evidências aproveitadas para a troca.",
      data.diagnosisSummary,
      data.notes?.trim(),
    ].filter(Boolean).join("\n");
    checklistData.noc = {
      autorizada: "sim",
      analista: data.nocAnalyst?.trim() || "",
      protocolo: data.nocProtocol,
      data: now.toISOString().slice(0, 10),
      hora: now.toTimeString().slice(0, 5),
    };
    // A RPC já validou proprietário/admin e criou a revisão. Usamos o cliente
    // administrativo apenas para pré-preencher o rascunho recém-criado quando
    // quem abriu o diagnóstico é administrador e o checklist pertence a outro técnico.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await (supabaseAdmin as any)
      .from("checklists")
      .update({ dados: checklistData as never })
      .eq("id", created.id);
    if (updateError) throw new Error(updateError.message);

    return {
      id: created.id as string,
      revisionNumber: Number(created.revision_number ?? 0),
      resumed: false,
    };
  });

/** Cria/retoma a revisão rascunho de reteste sem alterar a versão anterior. */
export const createDiagnosticRetestDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checklistCode: string; diagnosisSummary: string }) => ({
    checklistCode: z.string().trim().regex(/^[A-Za-z0-9_-]{4,100}$/).parse(data.checklistCode),
    diagnosisSummary: z.string().trim().min(3).max(2_000).parse(data.diagnosisSummary),
  }))
  .handler(async ({ context, data }) => {
    const { data: providerId, error: providerError } = await context.supabase.rpc("current_provider_id");
    if (providerError || !providerId) throw new Error("Provedor do usuário não encontrado.");
    const baseCode = data.checklistCode.replace(/-R\d+$/i, "");
    const { data: candidates, error: checklistError } = await context.supabase
      .from("checklists")
      .select("id, status, is_current, revision_number")
      .eq("provider_id", providerId)
      .or(`numero_publico.eq.${baseCode},codigo_validacao.eq.${baseCode}`)
      .order("revision_number", { ascending: false });
    if (checklistError) throw new Error(checklistError.message);
    const current = (candidates ?? []).find((item) => item.is_current !== false);
    if (!current) throw new Error("Checklist técnico vinculado não encontrado neste provedor.");
    if (current.status === "rascunho") {
      return { id: current.id, revisionNumber: current.revision_number, resumed: true };
    }
    if (current.status !== "finalizado") {
      throw new Error("O checklist vinculado precisa estar finalizado antes de abrir um novo teste.");
    }
    const { data: revision, error } = await context.supabase.rpc("create_checklist_revision", {
      _parent_id: current.id,
      _reason: "Novo teste criado pelo Diagnóstico Inteligente",
      _stage: "additional_test",
      _notes: data.diagnosisSummary,
    });
    if (error) throw new Error(error.message);
    const created = Array.isArray(revision) ? revision[0] : revision;
    if (!created?.id) throw new Error("Não foi possível criar o rascunho do novo teste.");
    return { id: created.id as string, revisionNumber: Number(created.revision_number ?? 0), resumed: false };
  });

export const getSmartDiagnosticAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSmartDiagnosticAiConfiguration } = await import("@/lib/smart-diagnostic-ai.server");
    return getSmartDiagnosticAiConfiguration();
  });

export const getSmartDiagnosticNocContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: providerId } = await context.supabase.rpc("current_provider_id");
    if (!providerId) return { phone: null as string | null };
    const { data, error } = await context.supabase
      .from("smart_diagnostic_settings" as never)
      .select("noc_whatsapp_e164" as never)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (error?.code === "PGRST205") return { phone: null as string | null };
    if (error) throw new Error(error.message);
    const phone = (data as { noc_whatsapp_e164?: string | null } | null)?.noc_whatsapp_e164 ?? null;
    return { phone: /^55\d{10,11}$/.test(phone ?? "") ? phone : null };
  });

export const syncSmartDiagnosticSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { session: SmartDiagnosticSession }) => ({
    session: validateSession(data.session),
  }))
  .handler(async ({ context, data }) => {
    const { syncSmartDiagnosticRecord } = await import("@/lib/smart-diagnostic-ai.server");
    return syncSmartDiagnosticRecord({
      db: context.supabase,
      userId: context.userId,
      session: data.session,
    });
  });

export const runSmartDiagnosticAiReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    session: SmartDiagnosticSession;
    mode: AiReviewMode;
    provider?: AiGatewayProvider;
    allowPaid?: boolean;
  }) => ({
    session: validateSession(data.session),
    mode: z.enum(["triage", "review"]).parse(data.mode),
    provider: data.provider
      ? z.enum(["groq", "openrouter", "github_deepseek", "github_llama", "openai"]).parse(data.provider)
      : undefined,
    allowPaid: Boolean(data.allowPaid),
  }))
  .handler(async ({ context, data }) => {
    const { assertAiRateLimit, runSmartDiagnosticAi } =
      await import("@/lib/smart-diagnostic-ai.server");
    assertAiRateLimit(context.userId);
    if (data.allowPaid || data.provider === "openai") {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Somente administradores podem selecionar um provider pago.");
    }
    return runSmartDiagnosticAi({
      db: context.supabase,
      userId: context.userId,
      session: data.session,
      mode: data.mode,
      provider: data.provider,
      allowPaid: data.allowPaid,
    });
  });

export const healthCheckSmartDiagnosticAiGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores podem testar providers de IA.");
    const { healthCheckAiGateway } = await import("@/lib/ai-gateway.server");
    return healthCheckAiGateway(false);
  });

export const compareSmartDiagnosticAiProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { session: SmartDiagnosticSession; mode: AiReviewMode }) => ({
    session: validateSession(data.session),
    mode: z.enum(["triage", "review"]).parse(data.mode),
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores podem comparar modelos.");
    const { assertAiRateLimit, compareSmartDiagnosticAiProviders: compare } =
      await import("@/lib/smart-diagnostic-ai.server");
    assertAiRateLimit(context.userId);
    return compare({ db: context.supabase, userId: context.userId, ...data });
  });

/**
 * Ponto de integração para o Webi Diagnostic de PC/celular. A coleta externa
 * envia somente referência, tipo e metadados não sensíveis; arquivos continuam
 * no armazenamento privado da origem.
 */
export const linkSmartDiagnosticEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    sessionId: string;
    evidenceType: string;
    externalReference: string;
    metadata?: Record<string, string | number | boolean | null>;
  }) => ({
    sessionId: z.string().uuid().parse(data.sessionId),
    evidenceType: z.string().min(2).max(80).parse(data.evidenceType),
    externalReference: z.string().min(3).max(2_000).parse(data.externalReference),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).parse(data.metadata ?? {}),
  }))
  .handler(async ({ context, data }) => {
    const { data: session, error: sessionError } = await context.supabase
      .from("smart_diagnostic_sessions" as never)
      .select("id, technician_id" as never)
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sessionError || !session) throw new Error("Diagnóstico não encontrado.");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if ((session as { technician_id: string }).technician_id !== context.userId && !isAdmin) {
      throw new Error("Sem permissão para anexar evidência a este diagnóstico.");
    }
    const { error } = await context.supabase.from("smart_diagnostic_evidence" as never).insert({
      session_id: data.sessionId,
      evidence_type: data.evidenceType,
      external_reference: data.externalReference,
      source: "webi-diagnostic",
      metadata: data.metadata,
      recorded_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { saved: true };
  });

export const validateSmartDiagnosticForLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => ({
    sessionId: z.string().uuid().parse(data.sessionId),
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores podem validar casos para aprendizado.");
    const { validateSmartDiagnosticLearningCase } =
      await import("@/lib/smart-diagnostic-ai.server");
    return validateSmartDiagnosticLearningCase({
      db: context.supabase,
      userId: context.userId,
      sessionId: data.sessionId,
    });
  });
