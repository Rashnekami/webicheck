import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
