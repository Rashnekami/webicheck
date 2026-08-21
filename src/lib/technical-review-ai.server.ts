/**
 * Prompts da Avaliação Técnica Interna. Uso exclusivo do servidor.
 */
import { runAiPrompt } from "@/lib/ai-providers.server";

export type ReviewAiType =
  | "gerencial"
  | "solides"
  | "conversa"
  | "plano"
  | "copiloto"
  | "revisao"
  | "carta";

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
  anotacoes_confirmadas?: Array<{
    data: string;
    tipo: string;
    categoria: string | null;
    texto: string;
    competencias: string[];
  }>;
  anotacoes_em_rascunho?: number;
  pdi_atual?: Array<{
    objetivo: string;
    acao: string;
    indicador: string;
    prazo: string | null;
    apoio_gestao: string | null;
    status: string;
  }>;
  avaliacao_anterior?: Record<string, unknown> | null;
  /** Fatos confirmados pelo supervisor na auditoria dos checklists. */
  fatos_auditoria?: Array<{
    tipo: string;
    data: string | null;
    cliente: string | null;
    cidade: string | null;
    classificacao: string;
    fato: string;
    observacao_supervisor: string | null;
  }>;
  /** Registro da conversa: a voz do próprio técnico. */
  conversa?: {
    reacao: string | null;
    comentarios_do_tecnico: string | null;
    concordancia: string | null;
    acoes_combinadas: string | null;
    notas_do_supervisor: string | null;
  } | null;
  tom?: "direto" | "equilibrado" | "acolhedor";
}

const BASE_REGRAS = `
Regras obrigatórias:
- Baseie-se APENAS nos dados fornecidos. Nunca invente fatos, números ou situações.
- Linguagem profissional de gestão técnica em português do Brasil, sem julgamento pessoal.
- Fale de comportamentos e resultados observáveis, nunca de traços de personalidade.
- Não use termos discriminatórios nem faça inferências sobre vida pessoal, saúde ou opinião.
- Se faltarem dados para alguma conclusão, diga explicitamente que o dado não foi avaliado.
- Anotações em rascunho não são fatos confirmados e não podem sustentar conclusões.
- Quantidade de anotações não equivale a nota e nunca deve ser convertida em pontuação.
- A nota, o PDI final e toda decisão de gestão pertencem exclusivamente ao supervisor.
- Nunca recomende automaticamente advertência, punição, demissão ou promoção.
- Toda resposta deve começar com "Sugestão da IA — revisar antes de utilizar."
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
Monte um roteiro natural de conversa de feedback presencial, estimado para 5–10 minutos e tom ${tom}.
Inclua abertura curta, no máximo 3 reconhecimentos, no máximo 3 pontos de desenvolvimento,
exemplos confirmados, 2 ou 3 perguntas ao colaborador, acordos/PDI e fechamento objetivo.
Não trate discordância como problema comportamental.
Responda em JSON: {"roteiro": "..."}`;
  }
  if (type === "plano") {
    return `${common}
Proponha de 1 a 3 ações de PDI mensuráveis e realistas (excepcionalmente 4 somente se indispensável),
priorizando impacto e recorrência. Cada ação precisa de objetivo, ação combinada, indicador verificável,
prazo em dias e apoio da gestão. Não aplique o PDI; apresente para revisão.
Responda em JSON: {"acoes":[{"objetivo":"...","acao":"...","indicador":"...","prazo_dias":30,"apoio_gestao":"..."}]}`;
  }
  if (type === "copiloto") {
    return `${common}
Atue como copiloto do supervisor: identifique competências profissionais relacionadas aos registros,
profissionalize a redação de pontos fortes e de desenvolvimento sem inventar fatos e sugira onde cada
texto poderia ser usado. Não atribua nem altere notas.
Responda em JSON: {"orientacao":"...","competencias":["..."],"ponto_forte":"...","desenvolvimento":"..."}`;
  }
  if (type === "revisao") {
    return `${common}
Audite a coerência da avaliação antes da finalização. Verifique: notas 3 ou menores sem justificativa;
desenvolvimento sem PDI; anotações relevantes em rascunho; possíveis divergências entre notas e fatos;
metas ausentes; cálculo/itens não avaliados; e diferença entre comunicação técnica/interpessoal e
comunicação proativa operacional. Produza apenas alertas para revisão e confirmações, sem alterar dados.
Responda em JSON: {"alertas":["..."],"confirmacoes":["..."],"recomendacao":"..."}`;
  }
  if (type === "carta") {
    return `${common}
Escreva a carta de feedback que o supervisor vai entregar ao colaborador. É um texto
para a pessoa ler, não um formulário. Tom ${tom}, primeira pessoa do supervisor,
segunda pessoa para o colaborador, tratando-o pelo primeiro nome.

Estrutura obrigatória, nesta ordem, sem títulos numerados e sem markdown:
1. Abertura curta reconhecendo a conversa.
2. Reconhecimento. Use os fatos de "fatos_auditoria" e "anotacoes_confirmadas"
   classificados como positivos. CADA elogio precisa vir com o caso concreto que o
   sustenta: data, cliente ou tipo de atendimento. Se não houver fato registrado,
   escreva o reconhecimento a partir de "pontos_fortes" e NÃO invente exemplo.
3. Pontos de desenvolvimento. Mesma regra: o fato específico primeiro, o pedido depois.
   Quando houver contagem (ex.: 6 de 37 atendimentos), use o número.
4. O que ficou combinado: as ações de "pdi_atual" com prazo. Se houver curso indicado,
   apresente como o caminho combinado, nunca como punição por nota baixa.
5. "O que você me trouxe": o que está em "conversa". Inclua discordância e pedidos do
   colaborador, com as palavras dele. Omita esta parte inteira se "conversa" for nula.
6. "Sobre minha atuação como gestor": os compromissos do supervisor, tirados de
   "apoio_gestao" das ações de PDI e de "conversa". Omita se não houver nenhum.
7. Fechamento curto, sem promessa que o supervisor não fez.

Regras específicas desta carta:
- Elogie e critique COMPORTAMENTO e RESULTADO, nunca traço de personalidade.
  Proibido: "dedicado", "leal", "responsável", "esforçado", "comprometido",
  "desatento", "relaxado", "irresponsável", "falta de conhecimento".
  Em vez de "você é dedicado", escreva o que ele fez que mostra isso.
- Nada de sanduíche: não amorteça a crítica entre dois elogios.
- No máximo 3 reconhecimentos e no máximo 2 pontos de desenvolvimento. Escolha os de
  maior impacto e recorrência; deixar de fora é melhor que diluir.
- Não cite nota, percentual de avaliação nem escala. A carta fala de fatos e acordos.
- Não invente fato, data, cliente, curso, equipamento ou promessa que não esteja nos dados.
- Não mencione advertência, punição, promoção ou desligamento.
- Texto corrido em parágrafos curtos, sem bullet, pronto para imprimir e entregar.

Responda em JSON: {"carta": "..."}`;
  }
  return `${common}
Faça uma análise gerencial técnica: leitura geral do desempenho, riscos operacionais,
pontos fortes, pontos de atenção e recomendação de acompanhamento.
Responda em JSON: {"analise":"...","riscos":["..."],"recomendacoes":["..."]}`;
}

function flatten(type: ReviewAiType, parsed: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map((i) => `• ${String(i)}`).join("\n") : "");
  if (type === "solides") return str(parsed.texto);
  if (type === "carta") return str(parsed.carta);
  if (type === "conversa") return str(parsed.roteiro);
  if (type === "plano") {
    const actions = Array.isArray(parsed.acoes) ? parsed.acoes : [];
    return actions
      .slice(0, 4)
      .map((raw, index) => {
        const action = (raw ?? {}) as Record<string, unknown>;
        return [
          `Ação ${index + 1}`,
          `Objetivo: ${str(action.objetivo)}`,
          `Ação combinada: ${str(action.acao)}`,
          `Indicador: ${str(action.indicador)}`,
          `Prazo: ${action.prazo_dias ?? 30} dias`,
          `Apoio da gestão: ${str(action.apoio_gestao)}`,
        ].join("\n");
      })
      .join("\n\n");
  }
  if (type === "copiloto") {
    return [
      str(parsed.orientacao),
      parsed.competencias ? `\nCompetências relacionadas:\n${list(parsed.competencias)}` : "",
      str(parsed.ponto_forte) ? `\nSugestão de ponto forte:\n${str(parsed.ponto_forte)}` : "",
      str(parsed.desenvolvimento)
        ? `\nSugestão de desenvolvimento:\n${str(parsed.desenvolvimento)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (type === "revisao") {
    return [
      parsed.alertas
        ? `Alertas de revisão:\n${list(parsed.alertas)}`
        : "Nenhum alerta identificado.",
      parsed.confirmacoes ? `\nVerificações positivas:\n${list(parsed.confirmacoes)}` : "",
      str(parsed.recomendacao) ? `\nRecomendação: ${str(parsed.recomendacao)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
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
  let content = flatten(type, parsed).trim();
  if (!content) throw new Error("A IA não retornou conteúdo utilizável.");
  if (!content.startsWith("Sugestão da IA")) {
    content = `Sugestão da IA — revisar antes de utilizar.\n\n${content}`;
  }
  return { content, model };
}

export async function analyzeTechnicalEmployeeNote(noteText: string): Promise<{
  suggestedType: string;
  suggestedCategory: string;
  competencies: string[];
  professionalText: string;
  model: string;
}> {
  const prompt = `${BASE_REGRAS}
Analise esta anotação privada do supervisor sem tratá-la como fato além do que foi escrito:
${JSON.stringify(noteText)}

Sugira um tipo entre positivo, atencao, desenvolvimento, destaque, tecnico, atendimento,
comunicacao ou operacional; uma categoria curta; até 5 competências profissionais; e uma redação
profissional fiel ao registro original. Não aplique a sugestão automaticamente.
Responda em JSON: {"tipo":"...","categoria":"...","competencias":["..."],"texto_profissional":"..."}`;
  const { parseAiJson } = await import("@/lib/ai-providers.server");
  const { raw, model } = await runAiPrompt(prompt);
  const parsed = parseAiJson(raw) as Record<string, unknown>;
  const allowedTypes = new Set([
    "positivo",
    "atencao",
    "desenvolvimento",
    "destaque",
    "tecnico",
    "atendimento",
    "comunicacao",
    "operacional",
  ]);
  const rawType = String(parsed.tipo ?? "operacional")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return {
    suggestedType: allowedTypes.has(rawType) ? rawType : "operacional",
    suggestedCategory: String(parsed.categoria ?? ""),
    competencies: Array.isArray(parsed.competencias)
      ? parsed.competencias.slice(0, 5).map(String)
      : [],
    professionalText: String(parsed.texto_profissional ?? "").trim(),
    model,
  };
}
