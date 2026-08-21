/**
 * Produtividade técnica importada do Zumme (dashboard "PRODUTIVIDADE TÉCNICA").
 *
 * Enquanto não há API, os números são digitados a cada competência, um técnico
 * por vez, usando os filtros do próprio dashboard. Este arquivo concentra o
 * parsing e a normalização para que a digitação manual e a extração por
 * imagem produzam exatamente o mesmo formato.
 *
 * Compartilhado entre cliente e servidor — não importar nada de servidor aqui.
 */

/* ------------------------------------------------------------------ tempo */

/**
 * Converte o "TEMPO MÉDIO DE FINALIZAÇÃO" do Zumme em minutos.
 * Formatos aceitos: "1d 08:15", "08:15", "1d 8h", "32:15", "1 d 08:15:30".
 * Devolve null quando não reconhece — nunca chuta.
 */
export function parseZummeDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const text = String(input).trim().toLowerCase().replace(",", ".");
  if (!text) return null;

  let days = 0;
  let rest = text;

  const dayMatch = rest.match(/(\d+(?:\.\d+)?)\s*d(?:ias?|ay)?\b/);
  if (dayMatch) {
    days = Number(dayMatch[1]);
    rest = rest.replace(dayMatch[0], " ").trim();
  }

  let hours = 0;
  let minutes = 0;

  // "08:15" ou "08:15:30"
  const clock = rest.match(/(\d{1,3}):(\d{2})(?::(\d{2}))?/);
  if (clock) {
    hours = Number(clock[1]);
    minutes = Number(clock[2]);
  } else {
    // "8h 15m", "8h", "15m"
    const h = rest.match(/(\d+(?:\.\d+)?)\s*h/);
    const m = rest.match(/(\d+(?:\.\d+)?)\s*(?:m|min)/);
    if (h) hours = Number(h[1]);
    if (m) minutes = Number(m[1]);
    if (!h && !m) {
      // Só um número solto: interpreta como horas apenas se houve "d" antes,
      // caso contrário é ambíguo demais para adivinhar.
      const lone = rest.match(/^(\d+(?:\.\d+)?)$/);
      if (lone && dayMatch) hours = Number(lone[1]);
      else if (!dayMatch) return null;
    }
  }

  if (minutes >= 60 && !clock) return null;
  const total = Math.round(days * 1440 + hours * 60 + minutes);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

/** Minutos -> "1d 08:15", o mesmo formato mostrado no Zumme. */
export function formatZummeDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const days = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  const clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Minutos -> horas com uma casa, que é como as apresentações usam. */
export function minutesToHours(minutes: number | null | undefined): number | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

/* -------------------------------------------------------------- categorias */

export type ZummeCategory =
  | "suporte_tecnico"
  | "instalacao"
  | "mudanca_endereco"
  | "visita_tecnica"
  | "retencao"
  | "upgrade"
  | "outro";

export const ZUMME_CATEGORY_LABEL: Record<ZummeCategory, string> = {
  suporte_tecnico: "Suporte Técnico",
  instalacao: "Instalação",
  mudanca_endereco: "Mudança de Endereço",
  visita_tecnica: "Visita Técnica",
  retencao: "Retenção",
  upgrade: "Upgrade / Troca de equipamento",
  outro: "Outro",
};

/** Ordem de exibição — as quatro primeiras são as usadas nas apresentações. */
export const ZUMME_CATEGORY_ORDER: ZummeCategory[] = [
  "suporte_tecnico",
  "instalacao",
  "mudanca_endereco",
  "visita_tecnica",
  "retencao",
  "upgrade",
  "outro",
];

/**
 * O filtro ASSUNTO do Zumme tem mais de 25 valores, com variações PF/PJ que
 * são o mesmo serviço. Agrupa no conjunto que as apresentações usam.
 * A ordem dos testes importa: "INSTALAÇÃO DE CÂMERAS" tem que cair em
 * instalação antes de qualquer regra de suporte.
 */
export function categorizeAssunto(raw: string | null | undefined): ZummeCategory {
  const t = normalizeLabel(raw);
  if (!t) return "outro";

  if (t.includes("VISITA TECNICA")) return "visita_tecnica";
  if (t.includes("MUDANCA DE ENDERECO")) return "mudanca_endereco";
  if (t.startsWith("INSTALACAO")) return "instalacao";
  if (t.includes("RETENCAO")) return "retencao";
  if (t.includes("UPGRADE") || t.includes("TROCA EQUIPAMENTO")) return "upgrade";
  if (t.startsWith("SUPORTE") || t.includes("SEM CONEXAO")) return "suporte_tecnico";
  if (t.includes("SEGUNDO PONTO")) return "instalacao";
  return "outro";
}

/** Maiúsculas, sem acento, espaços colapsados. Mesma regra do resto do sistema. */
export function normalizeLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Linhas do painel "FINALIZADA POR TÉCNICO" que não são pessoas.
 * "OUTROS" é o agregado da cauda e nunca pode virar um técnico.
 */
const NON_TECHNICIAN = new Set(["OUTROS", "OUTRO", "NAO INFORMADO", "N/A", "SEM TECNICO", "TOTAL"]);

export function isAggregateRow(name: string | null | undefined): boolean {
  return NON_TECHNICIAN.has(normalizeLabel(name));
}

/* ------------------------------------------------------------ competência */

/** "2026-08" */
export const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidCompetence(v: string | null | undefined): boolean {
  return typeof v === "string" && COMPETENCE_RE.test(v);
}

export function competenceLabel(competence: string): string {
  if (!isValidCompetence(competence)) return competence ?? "—";
  const [y, m] = competence.split("-");
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${meses[Number(m) - 1]} de ${y}`;
}

export function competenceBounds(competence: string): { start: string; end: string } {
  const [y, m] = competence.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/* ------------------------------------------------------------------ tipos */

export type ZummeBreakdownKind = "assunto" | "motivo_fechamento";

export interface ZummeBreakdownRow {
  kind: ZummeBreakdownKind;
  label: string;
  category: ZummeCategory;
  quantity: number;
  percent: number | null;
}

export interface ZummeEntryInput {
  competence: string;
  /** null = linha agregada da equipe (o card do topo sem filtro de técnico). */
  employeeId: string | null;
  sourceName: string;
  cities: string[];
  totalOs: number;
  avgPerDay: number | null;
  avgCompletionRaw: string | null;
  breakdown: ZummeBreakdownRow[];
  notes?: string | null;
}

/** Validação compartilhada — roda no formulário e de novo no servidor. */
export function validateZummeEntry(input: ZummeEntryInput): string[] {
  const errors: string[] = [];
  if (!isValidCompetence(input.competence)) errors.push("Competência inválida (use AAAA-MM).");
  if (!input.sourceName?.trim()) errors.push("Informe o nome como aparece no Zumme.");
  if (!Number.isInteger(input.totalOs) || input.totalOs < 0)
    errors.push("Total de O.S. finalizadas deve ser um inteiro não negativo.");
  if (input.avgPerDay != null && input.avgPerDay < 0)
    errors.push("Média por dia não pode ser negativa.");
  if (input.avgCompletionRaw && parseZummeDuration(input.avgCompletionRaw) == null)
    errors.push('Tempo médio não reconhecido. Use o formato do Zumme, ex.: "1d 08:15".');

  const soma = input.breakdown
    .filter((b) => b.kind === "assunto")
    .reduce((acc, b) => acc + (b.quantity || 0), 0);
  if (soma > input.totalOs)
    errors.push(
      `A soma por assunto (${soma}) é maior que o total de O.S. (${input.totalOs}). Confira os números.`,
    );

  for (const row of input.breakdown) {
    if (!Number.isInteger(row.quantity) || row.quantity < 0)
      errors.push(`Quantidade inválida em "${row.label}".`);
  }
  return errors;
}
