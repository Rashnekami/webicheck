import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SmartDiagnosticSession } from "@/lib/smart-diagnostic";
import type { AiReviewMode } from "@/lib/smart-diagnostic-ai";

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
    }),
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
  .inputValidator((data: { session: SmartDiagnosticSession; mode: AiReviewMode }) => ({
    session: validateSession(data.session),
    mode: z.enum(["triage", "review"]).parse(data.mode),
  }))
  .handler(async ({ context, data }) => {
    const { assertAiRateLimit, runSmartDiagnosticAi } =
      await import("@/lib/smart-diagnostic-ai.server");
    assertAiRateLimit(context.userId);
    return runSmartDiagnosticAi({
      db: context.supabase,
      userId: context.userId,
      session: data.session,
      mode: data.mode,
    });
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
