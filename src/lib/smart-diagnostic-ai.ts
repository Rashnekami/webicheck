import { z } from "zod";

import type {
  DiagnosticAnswer,
  DiagnosticEvaluation,
  SmartDiagnosticSession,
} from "@/lib/smart-diagnostic";

export const SMART_DIAGNOSTIC_AI_PROMPT_VERSION = "webi-noc-v2";

export const AI_REVIEW_STATUSES = [
  "VALIDADO",
  "VALIDADO_COM_RESSALVA",
  "PENDENCIA",
  "DIVERGENCIA",
  "REVISAO_NOC",
] as const;

export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];
export type AiReviewMode = "triage" | "review";

const aiDivergenceSchema = z.object({
  codigo: z.string().min(2).max(80),
  severidade: z.enum(["baixa", "media", "alta", "critica"]),
  descricao: z.string().min(3).max(600),
  evidencia_origem: z.string().min(2).max(500),
  acao_corretiva: z.string().min(2).max(500),
});

export const aiDiagnosticReviewSchema = z.object({
  status: z.enum(AI_REVIEW_STATUSES),
  diagnostico_provavel: z.string().min(2).max(500),
  confianca: z.number().int().min(0).max(100),
  proxima_acao: z.string().min(2).max(600),
  testes_necessarios: z.array(z.string().min(2).max(300)).max(12),
  divergencias: z.array(aiDivergenceSchema).max(12),
  evidencias_faltantes: z.array(z.string().min(2).max(300)).max(12),
  troca_ont_recomendada: z.boolean(),
  necessita_noc_humano: z.boolean(),
  justificativa: z.string().min(3).max(1_200),
  resumo_tecnico: z.string().min(3).max(1_500),
  fatos_nao_informados: z.array(z.string().min(2).max(300)).max(20),
});

export type AiDiagnosticReviewBody = z.infer<typeof aiDiagnosticReviewSchema>;

export interface AiDiagnosticReview extends AiDiagnosticReviewBody {
  advisory: true;
  mode: AiReviewMode;
  provider?: string;
  model: string;
  promptVersion: string;
  analyzedAt: string;
  requestId: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  latencyMs?: number;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  guardrailsApplied: string[];
  persistence: "saved" | "migration_pending" | "not_linked";
  memoryCasesUsed: number;
}

export const AI_REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "diagnostico_provavel",
    "confianca",
    "proxima_acao",
    "testes_necessarios",
    "divergencias",
    "evidencias_faltantes",
    "troca_ont_recomendada",
    "necessita_noc_humano",
    "justificativa",
    "resumo_tecnico",
    "fatos_nao_informados",
  ],
  properties: {
    status: { type: "string", enum: AI_REVIEW_STATUSES },
    diagnostico_provavel: { type: "string" },
    confianca: { type: "integer", minimum: 0, maximum: 100 },
    proxima_acao: { type: "string" },
    testes_necessarios: { type: "array", items: { type: "string" } },
    divergencias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "severidade", "descricao", "evidencia_origem", "acao_corretiva"],
        properties: {
          codigo: { type: "string" },
          severidade: {
            type: "string",
            enum: ["baixa", "media", "alta", "critica"],
          },
          descricao: { type: "string" },
          evidencia_origem: { type: "string" },
          acao_corretiva: { type: "string" },
        },
      },
    },
    evidencias_faltantes: { type: "array", items: { type: "string" } },
    troca_ont_recomendada: { type: "boolean" },
    necessita_noc_humano: { type: "boolean" },
    justificativa: { type: "string" },
    resumo_tecnico: { type: "string" },
    fatos_nao_informados: { type: "array", items: { type: "string" } },
  },
} as const;

function redactText(value: string): string {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL_REMOVIDO]")
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b/g, "[TELEFONE_REMOVIDO]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[DOCUMENTO_REMOVIDO]")
    .slice(0, 700);
}

function sanitizeAnswer(value: DiagnosticAnswer): DiagnosticAnswer {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 30).map(redactText);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 40)
      .map(([key, item]) => [key.slice(0, 80), redactText(item)]),
  );
}

export interface SanitizedAiDiagnosticInput {
  schemaVersion: "webicheck-ai-input-v2";
  engineVersion: string;
  mode: AiReviewMode;
  serviceType: string;
  city: string;
  equipmentModel: string;
  symptoms: string[];
  answers: Record<string, DiagnosticAnswer>;
  deterministic: {
    status: string;
    probableCause: string;
    hypotheses: DiagnosticEvaluation["hypotheses"];
    validations: string[];
    eliminated: string[];
    recommendations: string[];
    divergences: DiagnosticEvaluation["divergences"];
    noc: DiagnosticEvaluation["noc"];
    ontExchange: DiagnosticEvaluation["ontExchange"];
  };
  operation: {
    decision: string;
    exchangeReasons: string[];
    exchangeNotes: string;
    nocAuthorization: string;
    postExchangeRetest: string;
    hasRemovedSerial: boolean;
    hasInstalledSerial: boolean;
  };
  verifiedMemoryCases: Array<{
    symptoms: string[];
    probableCause: string;
    outcome: string;
    summary: string;
  }>;
}

export function buildSanitizedAiInput(
  session: SmartDiagnosticSession,
  evaluation: DiagnosticEvaluation,
  mode: AiReviewMode,
  verifiedMemoryCases: SanitizedAiDiagnosticInput["verifiedMemoryCases"] = [],
): SanitizedAiDiagnosticInput {
  return {
    schemaVersion: "webicheck-ai-input-v2",
    engineVersion: session.engineVersion,
    mode,
    serviceType: session.metadata.serviceType || "manutencao",
    city: redactText(session.metadata.city || "NÃO INFORMADO"),
    equipmentModel: redactText(session.metadata.equipmentModel || "NÃO INFORMADO"),
    symptoms: session.symptoms.slice(0, 30),
    answers: Object.fromEntries(
      Object.entries(session.answers)
        .slice(0, 120)
        .map(([key, value]) => [key.slice(0, 100), sanitizeAnswer(value)]),
    ),
    deterministic: {
      status: evaluation.status,
      probableCause: evaluation.probableCause,
      hypotheses: evaluation.hypotheses.slice(0, 12),
      validations: evaluation.validations.slice(0, 30),
      eliminated: evaluation.eliminated.slice(0, 30),
      recommendations: evaluation.recommendations.slice(0, 20),
      divergences: evaluation.divergences.slice(0, 20),
      noc: evaluation.noc,
      ontExchange: evaluation.ontExchange,
    },
    operation: {
      decision: session.metadata.operation?.decision ?? "NÃO INFORMADO",
      exchangeReasons: (session.metadata.operation?.exchangeReasons ?? []).slice(0, 12).map(redactText),
      exchangeNotes: redactText(session.metadata.operation?.exchangeNotes ?? "NÃO INFORMADO"),
      nocAuthorization: session.metadata.operation?.nocAuthorization ?? "NÃO INFORMADO",
      postExchangeRetest: session.metadata.operation?.postExchangeRetest ?? "NÃO INFORMADO",
      hasRemovedSerial: Boolean(session.metadata.operation?.removedSerial?.trim()),
      hasInstalledSerial: Boolean(session.metadata.operation?.installedSerial?.trim()),
    },
    verifiedMemoryCases: verifiedMemoryCases.slice(0, 3).map((item) => ({
      symptoms: item.symptoms.slice(0, 20),
      probableCause: redactText(item.probableCause),
      outcome: redactText(item.outcome),
      summary: redactText(item.summary),
    })),
  };
}

export function enforceAiGuardrails(
  review: AiDiagnosticReviewBody,
  evaluation: DiagnosticEvaluation,
): { review: AiDiagnosticReviewBody; applied: string[] } {
  const guarded: AiDiagnosticReviewBody = {
    ...review,
    testes_necessarios: [...review.testes_necessarios],
    divergencias: [...review.divergencias],
    evidencias_faltantes: [...review.evidencias_faltantes],
    fatos_nao_informados: [...review.fatos_nao_informados],
  };
  const applied: string[] = [];

  if (guarded.troca_ont_recomendada && !evaluation.noc.eligible) {
    guarded.troca_ont_recomendada = false;
    guarded.necessita_noc_humano = true;
    guarded.status = "PENDENCIA";
    guarded.divergencias.unshift({
      codigo: "AI_TROCA_BLOQUEADA",
      severidade: "alta",
      descricao:
        "A IA sugeriu troca, mas o motor determinístico não confirmou todas as validações obrigatórias.",
      evidencia_origem:
        evaluation.noc.missing.join("; ") || "Critérios determinísticos incompletos.",
      acao_corretiva: "Concluir as validações obrigatórias antes de solicitar análise do NOC.",
    });
    guarded.evidencias_faltantes = [
      ...new Set([...evaluation.noc.missing, ...guarded.evidencias_faltantes]),
    ];
    applied.push("Troca de ONT bloqueada pelo motor determinístico.");
  }

  if (evaluation.divergences.some((item) => item.severity === "critical")) {
    guarded.status = "DIVERGENCIA";
    guarded.necessita_noc_humano = true;
    applied.push("Divergência crítica determinística prevaleceu sobre o parecer da IA.");
  }

  if (evaluation.status === "AGUARDANDO_TESTE" && guarded.status === "VALIDADO") {
    guarded.status = "PENDENCIA";
    guarded.evidencias_faltantes = [
      ...new Set(["Reteste obrigatório não concluído.", ...guarded.evidencias_faltantes]),
    ];
    applied.push("Validação final bloqueada até a conclusão do reteste.");
  }

  return { review: guarded, applied };
}
