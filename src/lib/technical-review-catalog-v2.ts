/**
 * Catálogo v2 da Avaliação Técnica — escala 1 a 10, 7 grupos, 35 itens.
 *
 * O catálogo v1 (escala 1–5, 23 itens) continua em technical-review-catalog.ts
 * e NÃO foi alterado: avaliações antigas são lidas e renderizadas com ele.
 * A escolha é feita por `scale_version` na avaliação, nunca por conversão.
 *
 * Os itens são escritos como pergunta, porque o supervisor está respondendo
 * "isso aconteceu?" e não classificando um atributo da pessoa.
 */

export type ReviewCategoryV2 =
  | "execucao"
  | "qualidade"
  | "evidencias"
  | "recorrencia"
  | "produtividade"
  | "seguranca"
  | "comunicacao";

export interface ReviewItemDefV2 {
  key: string;
  label: string;
  /** Aparece embaixo do item para lembrar o que observar antes de pontuar. */
  help?: string;
}

export interface ReviewGroupDefV2 {
  category: ReviewCategoryV2;
  title: string;
  weight: number;
  scoreColumn:
    | "technical_score"
    | "recurrence_score"
    | "evidence_score"
    | "productivity_score"
    | "operational_score"
    | "communication_score";
  notesColumn:
    | "technical_notes"
    | "recurrence_notes"
    | "evidence_notes"
    | "productivity_notes"
    | "operational_notes"
    | "communication_notes";
  items: ReviewItemDefV2[];
}

/**
 * As colunas de nota do banco são 6 e os grupos agora são 7. "Execução" e
 * "Qualidade" compartilham technical_score: as duas tratam da execução técnica,
 * e a média ponderada final é calculada a partir dos itens, não das colunas —
 * elas são cache para listagem. Nenhuma coluna nova foi criada.
 */
export const REVIEW_GROUPS_V2: ReviewGroupDefV2[] = [
  {
    category: "execucao",
    title: "Execução e diagnóstico técnico",
    weight: 0.25,
    scoreColumn: "technical_score",
    notesColumn: "technical_notes",
    items: [
      {
        key: "v2_exe_identifica",
        label: "Identifica corretamente o problema antes de iniciar a intervenção?",
        help: "Chega sabendo o que vai fazer, ou começa a trocar peça para ver no que dá?",
      },
      {
        key: "v2_exe_testes",
        label: "Realiza testes compatíveis para confirmar ou descartar as causas prováveis?",
      },
      {
        key: "v2_exe_registra",
        label: "Registra medições, resultados e as condições encontradas?",
      },
      {
        key: "v2_exe_diferencia",
        label:
          "Diferencia problema de rede, equipamento, Wi-Fi, infraestrutura interna e configuração?",
      },
      {
        key: "v2_exe_causa_raiz",
        label: "Resolve a causa raiz em vez de aplicar solução paliativa?",
        help: "O sintoma parou ou a causa foi eliminada? É a diferença entre resolver e adiar.",
      },
      {
        key: "v2_exe_escalona",
        label: "Sabe a hora de acionar o NOC ou a supervisão?",
        help: "Tanto demorar demais para pedir ajuda quanto escalar sem ter investigado.",
      },
    ],
  },
  {
    category: "qualidade",
    title: "Qualidade da instalação ou manutenção",
    weight: 0.2,
    scoreColumn: "technical_score",
    notesColumn: "technical_notes",
    items: [
      {
        key: "v2_qua_acabamento",
        label: "Acabamento, conectorização, fusão e organização seguem o padrão?",
      },
      { key: "v2_qua_local", label: "Os equipamentos ficam instalados em local adequado?" },
      { key: "v2_qua_entrega", label: "O serviço é entregue funcionando e validado?" },
      { key: "v2_qua_testes_finais", label: "São realizados os testes finais necessários?" },
      {
        key: "v2_qua_improviso",
        label: "O serviço evita improvisos que geram correção depois?",
      },
    ],
  },
  {
    category: "evidencias",
    title: "Evidências e documentação",
    weight: 0.15,
    scoreColumn: "evidence_score",
    notesColumn: "evidence_notes",
    items: [
      {
        key: "v2_evi_fotos",
        label: "As fotos comprovam com clareza o antes, a execução e o resultado?",
      },
      {
        key: "v2_evi_checklist",
        label: "O checklist está completo e corresponde ao serviço realizado?",
        help: "A auditoria de checklists te dá esse número pronto.",
      },
      {
        key: "v2_evi_relato",
        label: "O relato informa problema, diagnóstico, causa, ação e resultado?",
      },
      {
        key: "v2_evi_coerencia",
        label: "As informações da O.S., checklist, fotos e medições são coerentes entre si?",
      },
      {
        key: "v2_evi_pendencias",
        label: "Pendências e limitações foram registradas corretamente?",
      },
    ],
  },
  {
    category: "recorrencia",
    title: "Qualidade e reincidência",
    weight: 0.15,
    scoreColumn: "recurrence_score",
    notesColumn: "recurrence_notes",
    items: [
      { key: "v2_rec_retorno", label: "Houve retorno ao mesmo cliente pelo mesmo motivo?" },
      {
        key: "v2_rec_reabertura",
        label: "Houve reabertura de O.S. por falha de execução ou de documentação?",
      },
      { key: "v2_rec_correcao", label: "O serviço precisou ser corrigido por outro técnico?" },
      {
        key: "v2_rec_responsabilidade",
        label: "A reincidência identificada era mesmo responsabilidade do técnico?",
        help: "Equipamento com defeito posterior e problema interno do cliente não contam.",
      },
      { key: "v2_rec_evolucao", label: "Houve evolução em relação ao mês anterior?" },
    ],
  },
  {
    category: "produtividade",
    title: "Produtividade e gestão da agenda",
    weight: 0.1,
    scoreColumn: "productivity_score",
    notesColumn: "productivity_notes",
    items: [
      {
        key: "v2_pro_volume",
        label: "Cumpre o volume esperado considerando complexidade, cidade e dias trabalhados?",
        help: "Os números do Zumme aparecem ao lado quando a competência foi lançada.",
      },
      { key: "v2_pro_tempo", label: "Mantém tempo adequado sem prejudicar a qualidade?" },
      { key: "v2_pro_os", label: "Atualiza e finaliza corretamente as O.S.?" },
      { key: "v2_pro_comunica", label: "Comunica atrasos e impedimentos com antecedência?" },
      { key: "v2_pro_paradas", label: "Evita deixar O.S. paradas sem justificativa?" },
    ],
  },
  {
    category: "seguranca",
    title: "Segurança, organização e patrimônio",
    weight: 0.1,
    scoreColumn: "operational_score",
    notesColumn: "operational_notes",
    items: [
      {
        key: "v2_seg_epi",
        label: "Utiliza corretamente os EPIs?",
        help: "Item de segurança: qualquer nota baixa aqui merece conversa imediata, não só registro.",
      },
      { key: "v2_seg_procedimentos", label: "Cumpre os procedimentos de segurança?" },
      {
        key: "v2_seg_organizacao",
        label: "Mantém veículo, materiais e ferramentas organizados?",
        help: "Organização não é estética: é tempo perdido procurando material no atendimento.",
      },
      { key: "v2_seg_patrimonio", label: "Cuida dos equipamentos e do patrimônio?" },
      {
        key: "v2_seg_avarias",
        label: "Comunica avarias e falta de material em tempo adequado?",
      },
    ],
  },
  {
    category: "comunicacao",
    title: "Comunicação e relacionamento",
    weight: 0.05,
    scoreColumn: "communication_score",
    notesColumn: "communication_notes",
    items: [
      {
        key: "v2_com_cliente",
        label: "Explica o problema e a solução ao cliente com clareza?",
      },
      { key: "v2_com_postura", label: "Mantém postura profissional no atendimento?" },
      { key: "v2_com_noc", label: "Envia informações suficientes ao NOC?" },
      {
        key: "v2_com_imprevistos",
        label: "Comunica imprevistos à supervisão no momento certo?",
      },
      {
        key: "v2_com_feedback",
        label: "Recebe e aplica os feedbacks combinados?",
        help: "Discordar não é problema. Combinar e não aplicar, sim.",
      },
    ],
  },
];

export const REVIEW_ITEM_INDEX_V2: Record<
  string,
  { group: ReviewGroupDefV2; item: ReviewItemDefV2 }
> = Object.fromEntries(
  REVIEW_GROUPS_V2.flatMap((group) => group.items.map((item) => [item.key, { group, item }])),
);

export type ScoreMapV2 = Record<string, number | null>;

/** Média do grupo ignorando os não avaliados. N/A nunca vira zero. */
export function groupAverageV2(group: ReviewGroupDefV2, scores: ScoreMapV2): number | null {
  const values = group.items
    .map((i) => scores[i.key])
    .filter((v): v is number => typeof v === "number" && v >= 1 && v <= 10);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Nota geral ponderada, renormalizando o peso dos grupos que têm dado. */
export function overallScoreV2(scores: ScoreMapV2): number | null {
  let sum = 0;
  let weight = 0;
  for (const group of REVIEW_GROUPS_V2) {
    const avg = groupAverageV2(group, scores);
    if (avg == null) continue;
    sum += avg * group.weight;
    weight += group.weight;
  }
  if (weight === 0) return null;
  return sum / weight;
}

export function scoreLabelV2(score: number | null | undefined): string {
  if (score == null) return "Não avaliado";
  if (score >= 9) return "Referência";
  if (score >= 7) return "Acima do esperado";
  if (score >= 5) return "Dentro do esperado";
  if (score >= 3) return "Abaixo do esperado";
  return "Crítico";
}

/* ------------------------------------------------------- regras de registro */

export type NudgeLevel = "obrigatorio" | "recomendado";

export interface ObservationNudge {
  itemKey: string;
  itemLabel: string;
  groupTitle: string;
  score: number;
  level: NudgeLevel;
  message: string;
}

/**
 * O que falta registrar antes de fechar a avaliação.
 *
 * Nota baixa sem justificativa é o que não se sustenta numa conversa — o
 * técnico pergunta "por quê?" e não há resposta. E nota máxima sem exemplo
 * vira elogio vazio, que não ensina nada nem é reaproveitável no próximo mês.
 * Por isso os dois extremos pedem observação, com o mesmo esforço: exigir só
 * no lado negativo faz o supervisor evitar dar nota alta.
 */
export function collectObservationNudges(
  scores: ScoreMapV2,
  notes: Record<string, string | null | undefined>,
): ObservationNudge[] {
  const out: ObservationNudge[] = [];
  for (const group of REVIEW_GROUPS_V2) {
    for (const item of group.items) {
      const score = scores[item.key];
      if (typeof score !== "number") continue;
      const hasNote = Boolean((notes[item.key] ?? "").trim());
      if (hasNote) continue;

      if (score <= 4) {
        out.push({
          itemKey: item.key,
          itemLabel: item.label,
          groupTitle: group.title,
          score,
          level: "obrigatorio",
          message:
            "Nota abaixo do esperado sem justificativa. Escreva o fato que sustenta — data, cliente ou O.S. Sem isso não há o que conversar com o técnico.",
        });
      } else if (score >= 9) {
        out.push({
          itemKey: item.key,
          itemLabel: item.label,
          groupTitle: group.title,
          score,
          level: "obrigatorio",
          message:
            "Nota de referência sem exemplo. Qual foi o caso concreto? É o reconhecimento que o técnico leva da conversa.",
        });
      }
    }
  }
  return out;
}

export interface ReviewProgress {
  totalItems: number;
  scored: number;
  notApplicable: number;
  pending: number;
  withObservation: number;
  nudges: ObservationNudge[];
}

export function reviewProgress(
  scores: ScoreMapV2,
  notes: Record<string, string | null | undefined>,
): ReviewProgress {
  const all = REVIEW_GROUPS_V2.flatMap((g) => g.items);
  let scored = 0;
  let notApplicable = 0;
  let withObservation = 0;
  for (const item of all) {
    const s = scores[item.key];
    if (typeof s === "number") scored++;
    else if (item.key in scores) notApplicable++;
    if ((notes[item.key] ?? "").trim()) withObservation++;
  }
  return {
    totalItems: all.length,
    scored,
    notApplicable,
    pending: all.length - scored - notApplicable,
    withObservation,
    nudges: collectObservationNudges(scores, notes),
  };
}
