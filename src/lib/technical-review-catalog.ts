/**
 * Catálogo de critérios da Avaliação Técnica Interna.
 * Notas de 1 a 5; itens podem ser marcados como "não avaliado" (N/A),
 * que ficam de fora da média do grupo e do cálculo geral.
 */

export type ReviewCategory =
  | "tecnica"
  | "recorrencia"
  | "evidencias"
  | "produtividade"
  | "postura"
  | "comunicacao";

export interface ReviewItemDef {
  key: string;
  label: string;
  help?: string;
}

export interface ReviewGroupDef {
  category: ReviewCategory;
  title: string;
  weight: number;
  /** Coluna de nota do grupo na tabela de avaliações. */
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
  items: ReviewItemDef[];
}

export const REVIEW_GROUPS: ReviewGroupDef[] = [
  {
    category: "tecnica",
    title: "Execução técnica",
    weight: 0.3,
    scoreColumn: "technical_score",
    notesColumn: "technical_notes",
    items: [
      { key: "tec_diagnostico", label: "Qualidade do diagnóstico" },
      { key: "tec_medicoes", label: "Medições de potência e testes corretos" },
      { key: "tec_fusao", label: "Padrão de fusão, conectorização e acabamento" },
      { key: "tec_normas", label: "Aderência às normas e procedimentos" },
      { key: "tec_solucao", label: "Solução definitiva x paliativa" },
    ],
  },
  {
    category: "recorrencia",
    title: "Recorrência e reincidência",
    weight: 0.2,
    scoreColumn: "recurrence_score",
    notesColumn: "recurrence_notes",
    items: [
      { key: "rec_retorno", label: "Índice de retorno no mesmo cliente" },
      { key: "rec_reabertura", label: "Reabertura de OS por falha de execução" },
      { key: "rec_causa_raiz", label: "Tratamento da causa raiz" },
    ],
  },
  {
    category: "evidencias",
    title: "Qualidade das evidências",
    weight: 0.15,
    scoreColumn: "evidence_score",
    notesColumn: "evidence_notes",
    items: [
      { key: "evi_fotos", label: "Fotos antes/depois completas e legíveis" },
      { key: "evi_preenchimento", label: "Preenchimento correto do checklist" },
      { key: "evi_relato", label: "Clareza do relato técnico" },
      { key: "evi_dados", label: "Consistência dos dados informados" },
    ],
  },
  {
    category: "produtividade",
    title: "Produtividade",
    weight: 0.15,
    scoreColumn: "productivity_score",
    notesColumn: "productivity_notes",
    items: [
      { key: "prod_volume", label: "Volume de atendimentos no período" },
      { key: "prod_tempo", label: "Tempo médio por atendimento" },
      { key: "prod_prazo", label: "Cumprimento de prazos e agenda" },
    ],
  },
  {
    category: "postura",
    title: "Postura operacional",
    weight: 0.1,
    scoreColumn: "operational_score",
    notesColumn: "operational_notes",
    items: [
      { key: "post_seguranca", label: "Segurança e uso de EPI" },
      { key: "post_organizacao", label: "Organização de materiais e veículo" },
      { key: "post_pontualidade", label: "Pontualidade e disponibilidade" },
      { key: "post_cuidado", label: "Cuidado com equipamentos e patrimônio" },
    ],
  },
  {
    category: "comunicacao",
    title: "Comunicação e relacionamento",
    weight: 0.1,
    scoreColumn: "communication_score",
    notesColumn: "communication_notes",
    items: [
      { key: "com_cliente", label: "Atendimento e orientação ao cliente" },
      { key: "com_equipe", label: "Comunicação com NOC, supervisão e equipe" },
      { key: "com_feedback", label: "Receptividade a feedback" },
    ],
  },
];

export const REVIEW_ITEM_INDEX: Record<string, { group: ReviewGroupDef; item: ReviewItemDef }> =
  Object.fromEntries(
    REVIEW_GROUPS.flatMap((group) => group.items.map((item) => [item.key, { group, item }])),
  );

export type ScoreMap = Record<string, number | null>;

/** Média simples do grupo, ignorando itens não avaliados. */
export function groupAverage(group: ReviewGroupDef, scores: ScoreMap): number | null {
  const values = group.items
    .map((i) => scores[i.key])
    .filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Nota geral ponderada, renormalizando os pesos dos grupos avaliados. */
export function overallScore(scores: ScoreMap): number | null {
  let sum = 0;
  let weight = 0;
  for (const group of REVIEW_GROUPS) {
    const avg = groupAverage(group, scores);
    if (avg == null) continue;
    sum += avg * group.weight;
    weight += group.weight;
  }
  if (weight === 0) return null;
  return sum / weight;
}

export function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "Não avaliado";
  if (score >= 4.5) return "Excelente";
  if (score >= 3.8) return "Acima do esperado";
  if (score >= 3.0) return "Dentro do esperado";
  if (score >= 2.0) return "Abaixo do esperado";
  return "Crítico";
}

export function formatScore(score: number | null | undefined): string {
  return score == null ? "—" : score.toFixed(1).replace(".", ",");
}
