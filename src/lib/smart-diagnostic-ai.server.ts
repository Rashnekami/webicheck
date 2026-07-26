import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAiGatewayConfiguration,
  parseGatewayJson,
  runAiGateway,
  type AiGatewayProvider,
} from "@/lib/ai-gateway.server";

import type { Database } from "@/integrations/supabase/types";
import {
  AI_REVIEW_JSON_SCHEMA,
  SMART_DIAGNOSTIC_AI_PROMPT_VERSION,
  aiDiagnosticReviewSchema,
  buildSanitizedAiInput,
  enforceAiGuardrails,
  type AiDiagnosticReview,
  type AiReviewMode,
  type SanitizedAiDiagnosticInput,
} from "@/lib/smart-diagnostic-ai";
import {
  evaluateSmartDiagnostic,
  getDiagnosticDecisionTrail,
  type DiagnosticEvaluation,
  type SmartDiagnosticSession,
} from "@/lib/smart-diagnostic";

type Db = SupabaseClient<Database>;
type DynamicTable<Row extends Record<string, unknown> = Record<string, unknown>> = {
  Row: Row;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};
type StoredLearningCase = {
  provider_id: string;
  symptom_codes: string[] | null;
  probable_cause: string | null;
  outcome: string | null;
  technical_summary: string | null;
  validated_for_learning: boolean;
};
type StoredDiagnosticSession = {
  id: string;
  provider_id: string;
  symptom_codes: string[] | null;
  equipment_model: string | null;
  status: string;
  deterministic_evaluation: {
    probableCause?: string;
    validations?: string[];
  } | null;
};
type SmartDiagnosticDatabase = {
  __InternalSupabase: Database["__InternalSupabase"];
  public: {
    Tables: {
      smart_diagnostic_sessions: DynamicTable<StoredDiagnosticSession>;
      smart_diagnostic_events: DynamicTable;
      smart_diagnostic_measurements: DynamicTable;
      smart_diagnostic_ai_reviews: DynamicTable;
      smart_diagnostic_ai_usage: DynamicTable;
      smart_diagnostic_learning_cases: DynamicTable<StoredLearningCase>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type SmartDiagnosticDb = SupabaseClient<SmartDiagnosticDatabase>;

function asSmartDiagnosticDb(db: Db): SmartDiagnosticDb {
  return db as unknown as SmartDiagnosticDb;
}

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const MAX_REQUEST_BYTES = 160_000;
const requestWindows = new Map<string, number[]>();

function getConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    triageModel: process.env.OPENAI_MODEL_TRIAGE?.trim() || "gpt-5.6-luna",
    reviewModel: process.env.OPENAI_MODEL_REVIEW?.trim() || "gpt-5.6-terra",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
  };
}

export function getSmartDiagnosticAiConfiguration() {
  const config = getConfig();
  const gateway = getAiGatewayConfiguration();
  return {
    configured: gateway.configured,
    triageModel: gateway.triageModel,
    reviewModel: gateway.reviewModel,
    embeddingModel: config.embeddingModel,
    promptVersion: SMART_DIAGNOSTIC_AI_PROMPT_VERSION,
    costMode: gateway.costMode,
    providers: gateway.providers,
  };
}

export function assertAiRateLimit(userId: string) {
  const now = Date.now();
  const active = (requestWindows.get(userId) ?? []).filter((timestamp) => now - timestamp < 60_000);
  if (active.length >= 8) {
    throw new Error("Limite de análises atingido. Aguarde um minuto e tente novamente.");
  }
  active.push(now);
  requestWindows.set(userId, active);
}

function isMigrationPending(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; message?: string };
  return (
      value.code === "PGRST205" ||
      value.code === "PGRST204" ||
      value.code === "42P01" ||
    Boolean(value.message?.includes("smart_diagnostic"))
  );
}

async function getProviderId(db: Db, userId: string): Promise<string> {
  const { data, error } = await db.from("profiles").select("provider_id").eq("id", userId).single();
  if (error || !data?.provider_id) throw new Error("Perfil do provedor não encontrado.");
  return data.provider_id;
}

async function resolveChecklist(
  db: Db,
  providerId: string,
  checklistCode: string,
): Promise<{ id: string; case_id: string; numero_publico: string | null } | null> {
  const code = checklistCode.trim();
  if (!code || !/^[A-Za-z0-9_-]{4,80}$/.test(code)) return null;

  const publicNumber = await db
    .from("checklists")
    .select("id, case_id, numero_publico")
    .eq("provider_id", providerId)
    .eq("numero_publico", code)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (publicNumber.data) return publicNumber.data;

  const validationCode = await db
    .from("checklists")
    .select("id, case_id, numero_publico")
    .eq("provider_id", providerId)
    .eq("codigo_validacao", code)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return validationCode.data ?? null;
}

function collectMeasurements(session: SmartDiagnosticSession) {
  const rows: Array<{
    metric_key: string;
    numeric_value: number | null;
    text_value: string | null;
    unit: string | null;
    source: string;
  }> = [];
  const add = (key: string, raw: string | undefined, unit: string | null, source: string) => {
    if (!raw?.trim()) return;
    const normalized = Number(raw.replace(",", "."));
    rows.push({
      metric_key: key,
      numeric_value: Number.isFinite(normalized) ? normalized : null,
      text_value: Number.isFinite(normalized) ? null : raw.slice(0, 300),
      unit,
      source,
    });
  };

  const performance = session.answers.performance_metrics;
  if (performance && typeof performance === "object" && !Array.isArray(performance)) {
    add("download", performance.download, "Mbps", "technician");
    add("upload", performance.upload, "Mbps", "technician");
    add("ping", performance.ping, "ms", "technician");
    add("jitter", performance.jitter, "ms", "technician");
    add("test_device", performance.device, null, "technician");
    add("test_connection", performance.connection, null, "technician");
    add("test_distance", performance.distance, null, "technician");
    add("contracted_plan", performance.plan, "Mbps", "technician");
  }

  const optical = session.answers.optical_metrics;
  if (optical && typeof optical === "object" && !Array.isArray(optical)) {
    add("rx_ont", optical.rxOnt, "dBm", optical.source || "technician");
    add("rx_olt", optical.rxOlt, "dBm", optical.source || "technician");
    add("optical_measurement_source", optical.source, null, "technician");
  }

  return rows;
}

export async function syncSmartDiagnosticRecord({
  db,
  userId,
  session,
  evaluation = evaluateSmartDiagnostic(session),
}: {
  db: Db;
  userId: string;
  session: SmartDiagnosticSession;
  evaluation?: DiagnosticEvaluation;
}): Promise<
  | { persisted: true; sessionId: string; checklistId: string | null }
  | { persisted: false; reason: "migration_pending" }
> {
  const providerId = await getProviderId(db, userId);
  const checklist = await resolveChecklist(db, providerId, session.metadata.linkedChecklistCode);
  const database = asSmartDiagnosticDb(db);
  const { error } = await database.from("smart_diagnostic_sessions").upsert(
    {
      id: session.id,
      provider_id: providerId,
      technician_id: userId,
      checklist_id: checklist?.id ?? null,
      case_id: checklist?.case_id ?? null,
      checklist_code:
        (checklist?.numero_publico ?? session.metadata.linkedChecklistCode.trim()) || null,
      service_order: session.metadata.workOrder.trim() || null,
      client_name: session.metadata.client.trim() || null,
      city: session.metadata.city.trim() || null,
      service_type: session.metadata.serviceType,
      equipment_model: session.metadata.equipmentModel.trim() || null,
      engine_version: session.engineVersion,
      root_session_id: session.metadata.revision?.rootSessionId ?? session.id,
      parent_session_id: session.metadata.revision?.parentSessionId ?? null,
      revision_number: session.metadata.revision?.revisionNumber ?? 1,
      revision_reason: session.metadata.revision?.reason ?? null,
      metadata_snapshot: session.metadata,
      operation_snapshot: session.metadata.operation ?? {},
      location_snapshot: session.metadata.location ?? {},
      status: evaluation.status,
      symptom_codes: session.symptoms,
      answers_snapshot: session.answers,
      deterministic_evaluation: evaluation,
      decision_path: getDiagnosticDecisionTrail(session),
      started_at: session.startedAt,
      updated_at: session.updatedAt,
    },
    { onConflict: "id" },
  );
  if (error) {
    if (isMigrationPending(error)) return { persisted: false, reason: "migration_pending" };
    throw new Error(error.message);
  }

  if (session.events.length) {
    const { error: eventError } = await database.from("smart_diagnostic_events").upsert(
      session.events.map((event) => ({
        session_id: session.id,
        client_event_id: event.id,
        question_id: event.questionId,
        question_text: event.question,
        category: event.category,
        answer: event.answer,
        answer_label: event.answerLabel,
        evidence_label: event.evidence,
        origin: event.origin,
        engine_version: event.engineVersion,
        event_at: event.createdAt,
        actor_user_id: userId,
      })),
      { onConflict: "session_id,client_event_id", ignoreDuplicates: true },
    );
    if (eventError && !isMigrationPending(eventError)) throw new Error(eventError.message);
  }

  const measurements = collectMeasurements(session);
  if (measurements.length) {
    const { error: measurementError } = await database.from("smart_diagnostic_measurements").upsert(
      measurements.map((measurement) => ({
        session_id: session.id,
        ...measurement,
        measured_at: session.updatedAt,
      })),
      { onConflict: "session_id,metric_key" },
    );
    if (measurementError && !isMigrationPending(measurementError)) {
      throw new Error(measurementError.message);
    }
  }

  return { persisted: true, sessionId: session.id, checklistId: checklist?.id ?? null };
}

function memoryScore(symptoms: string[], candidateSymptoms: string[]): number {
  const requested = new Set(symptoms);
  const candidate = new Set(candidateSymptoms);
  const intersection = [...requested].filter((item) => candidate.has(item)).length;
  const union = new Set([...requested, ...candidate]).size;
  return union ? intersection / union : 0;
}

async function getVerifiedMemoryCases(
  db: Db,
  providerId: string,
  symptoms: string[],
): Promise<SanitizedAiDiagnosticInput["verifiedMemoryCases"]> {
  const database = asSmartDiagnosticDb(db);
  const { data, error } = await database
    .from("smart_diagnostic_learning_cases")
    .select("symptom_codes, probable_cause, outcome, technical_summary")
    .eq("provider_id", providerId)
    .eq("validated_for_learning", true)
    .order("validated_at", { ascending: false })
    .limit(30);
  if (error) {
    if (isMigrationPending(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? [])
    .map((row) => ({
      symptoms: Array.isArray(row.symptom_codes) ? row.symptom_codes : [],
      probableCause: row.probable_cause || "NÃO INFORMADO",
      outcome: row.outcome || "NÃO INFORMADO",
      summary: row.technical_summary || "NÃO INFORMADO",
    }))
    .sort(
      (left: { symptoms: string[] }, right: { symptoms: string[] }) =>
        memoryScore(symptoms, right.symptoms) - memoryScore(symptoms, left.symptoms),
    )
    .filter((item: { symptoms: string[] }) => memoryScore(symptoms, item.symptoms) > 0)
    .slice(0, 3);
}

function buildInstructions(mode: AiReviewMode): string {
  return [
    "Você é o Webi NOC, uma camada CONSULTIVA de auditoria técnica para um provedor de internet.",
    "O motor determinístico do WebiCheck é a autoridade para bloqueios, reteste e autorização de troca.",
    "Nunca invente medições, evidências, fatos, testes ou confirmações.",
    "Se algo não existir, use NÃO INFORMADO; se faltar evidência, registre em evidencias_faltantes.",
    "Não autorize troca de ONT. Apenas indique se existem sinais técnicos para revisão humana.",
    "Trate casos históricos fornecidos como referências validadas, nunca como prova do caso atual.",
    "Procure contradições entre declarações, medições, ações e reteste.",
    mode === "review"
      ? "Faça auditoria final do atendimento completo e produza um parecer técnico conciso."
      : "Faça triagem do estado atual e sugira somente a próxima verificação de maior valor diagnóstico.",
    "Responda exclusivamente no schema JSON solicitado.",
  ].join("\n");
}

async function callAiGateway({
  mode,
  input,
  sessionId,
  provider,
  allowPaid,
}: {
  mode: AiReviewMode;
  input: SanitizedAiDiagnosticInput;
  sessionId: string;
  provider?: AiGatewayProvider;
  allowPaid?: boolean;
}) {
  const result = await runAiGateway({
    sessionId,
    mode,
    instructions: `${buildInstructions(mode)}\nSchema JSON obrigatório: ${JSON.stringify(AI_REVIEW_JSON_SCHEMA)}`,
    payload: input,
    provider,
    allowPaid,
  });
  return {
    parsed: aiDiagnosticReviewSchema.parse(parseGatewayJson(result.outputText)),
    model: result.model,
    provider: result.provider,
    requestId: result.requestId,
    latencyMs: result.latencyMs,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

export async function runSmartDiagnosticAi({
  db,
  userId,
  session,
  mode,
  provider,
  allowPaid,
}: {
  db: Db;
  userId: string;
  session: SmartDiagnosticSession;
  mode: AiReviewMode;
  provider?: AiGatewayProvider;
  allowPaid?: boolean;
}): Promise<AiDiagnosticReview> {
  const serialized = JSON.stringify(session);
  if (new TextEncoder().encode(serialized).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("O diagnóstico excedeu o tamanho permitido para análise.");
  }
  const evaluation = evaluateSmartDiagnostic(session);
  const providerId = await getProviderId(db, userId);
  const memoryCases = await getVerifiedMemoryCases(db, providerId, session.symptoms);
  const input = buildSanitizedAiInput(session, evaluation, mode, memoryCases);
  const result = await callAiGateway({ mode, input, sessionId: session.id, provider, allowPaid });
  const guarded = enforceAiGuardrails(result.parsed, evaluation);
  const synced = await syncSmartDiagnosticRecord({ db, userId, session, evaluation });
  const analyzedAt = new Date().toISOString();
  const review: AiDiagnosticReview = {
    ...guarded.review,
    advisory: true,
    mode,
    provider: result.provider,
    model: result.model,
    promptVersion: SMART_DIAGNOSTIC_AI_PROMPT_VERSION,
    analyzedAt,
    requestId: result.requestId,
    usage: result.usage,
    latencyMs: result.latencyMs,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
    guardrailsApplied: guarded.applied,
    persistence: synced.persisted ? "saved" : "migration_pending",
    memoryCasesUsed: memoryCases.length,
  };

  if (synced.persisted) {
    const database = asSmartDiagnosticDb(db);
    const { error } = await database.from("smart_diagnostic_ai_reviews").insert({
      session_id: session.id,
      mode,
      model: result.model,
      prompt_version: SMART_DIAGNOSTIC_AI_PROMPT_VERSION,
      structured_input: input,
      structured_output: review,
      deterministic_status: evaluation.status,
      guardrails_applied: guarded.applied,
      request_id: result.requestId,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      provider: result.provider,
      latency_ms: result.latencyMs,
      fallback_used: result.fallbackUsed,
      fallback_reason: result.fallbackReason,
      analyzed_by: userId,
      analyzed_at: analyzedAt,
    });
    if (error && !isMigrationPending(error)) throw new Error(error.message);
    const { error: usageError } = await database.from("smart_diagnostic_ai_usage").insert({
      provider_id: providerId,
      session_id: session.id,
      actor_user_id: userId,
      provider: result.provider,
      model: result.model,
      operation: mode,
      latency_ms: result.latencyMs,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      estimated_cost: 0,
      success: true,
      fallback_used: result.fallbackUsed,
      fallback_reason: result.fallbackReason,
    });
    if (usageError && !isMigrationPending(usageError)) throw new Error(usageError.message);
  }

  return review;
}

export async function compareSmartDiagnosticAiProviders({
  db,
  userId,
  session,
  mode,
}: {
  db: Db;
  userId: string;
  session: SmartDiagnosticSession;
  mode: AiReviewMode;
}) {
  const evaluation = evaluateSmartDiagnostic(session);
  const providerId = await getProviderId(db, userId);
  const memoryCases = await getVerifiedMemoryCases(db, providerId, session.symptoms);
  const input = buildSanitizedAiInput(session, evaluation, mode, memoryCases);
  const candidates: AiGatewayProvider[] = ["groq", "openrouter", "github_deepseek", "github_llama"];
  return Promise.all(
    candidates.map(async (provider) => {
      try {
        const result = await callAiGateway({ mode, input, sessionId: session.id, provider });
        const guarded = enforceAiGuardrails(result.parsed, evaluation);
        return {
          provider,
          model: result.model,
          success: true,
          latencyMs: result.latencyMs,
          usage: result.usage,
          fallbackUsed: result.fallbackUsed,
          review: guarded.review,
        };
      } catch (error) {
        return {
          provider,
          model: null,
          success: false,
          latencyMs: null,
          usage: null,
          fallbackUsed: false,
          error: error instanceof Error ? error.message.slice(0, 400) : "Falha desconhecida",
        };
      }
    }),
  );
}

async function createEmbedding(text: string): Promise<number[] | null> {
  // Embeddings OpenAI são cobrança por uso. No modo padrão o aprendizado mantém
  // apenas o caso validado e nunca faz uma chamada paga automaticamente.
  if ((process.env.AI_COST_MODE?.trim() || "free_only") === "free_only") return null;
  const config = getConfig();
  if (!config.apiKey || !config.embeddingModel) return null;
  try {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.embeddingModel,
        input: text.slice(0, 8_000),
        encoding_format: "float",
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return Array.isArray(payload?.data?.[0]?.embedding) ? payload.data[0].embedding : null;
  } catch {
    return null;
  }
}

export async function validateSmartDiagnosticLearningCase({
  db,
  userId,
  sessionId,
}: {
  db: Db;
  userId: string;
  sessionId: string;
}): Promise<
  | { saved: true; embeddingStored: boolean }
  | { saved: false; reason: "migration_pending" | "session_not_found" }
> {
  const database = asSmartDiagnosticDb(db);
  const { data: session, error } = await database
    .from("smart_diagnostic_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    if (isMigrationPending(error)) return { saved: false, reason: "migration_pending" };
    throw new Error(error.message);
  }
  if (!session) return { saved: false, reason: "session_not_found" };

  const evaluation = session.deterministic_evaluation ?? {};
  const summary = [
    `Sintomas: ${(session.symptom_codes ?? []).join(", ") || "NÃO INFORMADO"}`,
    `Causa provável: ${evaluation.probableCause || "NÃO INFORMADO"}`,
    `Status: ${session.status || "NÃO INFORMADO"}`,
    `Validações: ${(evaluation.validations ?? []).join("; ") || "NÃO INFORMADO"}`,
  ].join("\n");
  const embedding = await createEmbedding(summary);
  const now = new Date().toISOString();
  const { error: insertError } = await database.from("smart_diagnostic_learning_cases").upsert(
    {
      session_id: sessionId,
      provider_id: session.provider_id,
      symptom_codes: session.symptom_codes,
      equipment_model: session.equipment_model,
      probable_cause: evaluation.probableCause || "NÃO INFORMADO",
      outcome: session.status,
      technical_summary: summary,
      embedding_model: embedding ? getConfig().embeddingModel : null,
      embedding_json: embedding,
      validated_for_learning: true,
      validated_by: userId,
      validated_at: now,
    },
    { onConflict: "session_id" },
  );
  if (insertError) {
    if (isMigrationPending(insertError)) return { saved: false, reason: "migration_pending" };
    throw new Error(insertError.message);
  }
  await database
    .from("smart_diagnostic_sessions")
    .update({ validated_for_learning: true, validated_by: userId, validated_at: now })
    .eq("id", sessionId);
  return { saved: true, embeddingStored: Boolean(embedding) };
}
