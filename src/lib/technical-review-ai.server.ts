/**
 * Prompts da Avaliação Técnica Interna. Uso exclusivo do servidor.
 */
import { runAiPrompt } from "@/lib/ai-providers.server";

export type ReviewAiType = "gerencial" | "solides" | "conversa" | "plano";

export interface ReviewAiInput {
  colaborador: string;
  funcao: string | null;
  cidade: string | null;
  periodo: string;
  notas: Array<{ grupo: string; nota: number | null; observacao: string | null }>;
  nota_geral: number | null;
  itens: Array<{ item: string; nota: number | null; observacao: string | null }>;
  pontos_fortes: string | null;
  pontos_desenvolvimento: string | null;
  observacoes: string | null;
  evidencias: Array<{ tipo: string; os: string | null; descricao: string | null }>;
  tom?: "direto" | "equilibrado" | "acolhedor";
}

const BASE_REGRAS = `
Regras obrigatórias:
- Baseie-se APENAS nos dados fornecidos. Nunca invente fatos, números ou situações.
- Linguagem profissional de gestão técnica em português do Brasil, sem julgamento pessoal.
- Fale de comportamentos e resultados observáveis, nunca de traços de personalidade.
- Não use termos discriminatórios nem faça inferências sobre vida pessoal, saúde ou opinião.
- Se faltarem dados para alguma conclusão, diga explicitamente que o dado não foi avaliado.
`;

function prompts(type: ReviewAiType, payload: ReviewAiInput): string {
  const dados = JSON.stringify(payload, null, 2);
  const tom = payload.tom ?? "equilibrado";
  const common = `${BASE_REGRAS}\nDados da avaliação (JSON):\n${dados}\n`;

  if (type === "solides") {
    return `${common}
Escreva um texto pronto para ser colado no campo de feedback do sistema Sólides (RH),
com 2 a 4 parágrafos curtos, tom ${tom}, sem tópicos e sem markdown.
Responda em JSON: {"texto": "..."}`;
  }
  if (type === "conversa") {
    return `${common}
Monte um roteiro de conversa de feedback presencial (tom ${tom}), com abertura,
pontos fortes, pontos de desenvolvimento, acordos e fechamento.
Responda em JSON: {"roteiro": "..."}`;
  }
  if (type === "plano") {
    return `${common}
Proponha um plano de desenvolvimento individual objetivo para os próximos 30-60 dias.
Responda em JSON: {"objetivo":"...","acao":"...","indicador":"...","prazo_dias":30}`;
  }
  return `${common}
Faça uma análise gerencial técnica: leitura geral do desempenho, riscos operacionais,
pontos fortes, pontos de atenção e recomendação de acompanhamento.
Responda em JSON: {"analise":"...","riscos":["..."],"recomendacoes":["..."]}`;
}

function flatten(type: ReviewAiType, parsed: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((i) => `• ${String(i)}`).join("\n") : "";
  if (type === "solides") return str(parsed.texto);
  if (type === "conversa") return str(parsed.roteiro);
  if (type === "plano") {
    return [
      `Objetivo: ${str(parsed.objetivo)}`,
      `Ação: ${str(parsed.acao)}`,
      `Indicador: ${str(parsed.indicador)}`,
      `Prazo: ${parsed.prazo_dias ?? 30} dias`,
    ].join("\n");
  }
  return [
    str(parsed.analise),
    parsed.riscos ? `\nRiscos:\n${list(parsed.riscos)}` : "",
    parsed.recomendacoes ? `\nRecomendações:\n${list(parsed.recomendacoes)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateReviewAi(
  type: ReviewAiType,
  payload: ReviewAiInput,
): Promise<{ content: string; model: string }> {
  const { parseAiJson } = await import("@/lib/ai-providers.server");
  const { raw, model } = await runAiPrompt(prompts(type, payload));
  const parsed = parseAiJson(raw) as Record<string, unknown>;
  const content = flatten(type, parsed).trim();
  if (!content) throw new Error("A IA não retornou conteúdo utilizável.");
  return { content, model };
}
