// Módulo "Mapa Óptico Inteligente" — helpers puros (cores, geração de
// fibra, cálculo de perdas, texto automático). Sem I/O aqui; server
// functions em optical-map.functions.ts.

// Padrão de cores EIA/TIA-598 (o mesmo usado no mercado de FTTH no
// Brasil) — configurável por provider no futuro; por ora é o hardcoded
// "padrão inicial sugerido" do módulo.
export const FIBER_COLOR_SEQUENCE = [
  "Azul",
  "Laranja",
  "Verde",
  "Marrom",
  "Cinza",
  "Branco",
  "Vermelho",
  "Preto",
  "Amarelo",
  "Violeta",
  "Rosa",
  "Turquesa",
] as const;

export function colorForIndex(indexFrom1: number): string {
  const i = (indexFrom1 - 1) % FIBER_COLOR_SEQUENCE.length;
  return FIBER_COLOR_SEQUENCE[i];
}

export const CABLE_CAPACITY_PRESETS = [6, 12, 24, 36, 48, 72, 96, 144] as const;

export const SPLITTER_TYPE_PRESETS = [
  "1x2",
  "1x4",
  "1x8",
  "1x16",
  "1x32",
  "2x4",
  "2x8",
] as const;

export function outputsForSplitterType(tipo: string): number {
  const m = tipo.match(/^(\d+)x(\d+)$/i);
  if (!m) return 0;
  return parseInt(m[2], 10);
}

export interface FiberSpec {
  numero_global: number;
  tubo_numero: number;
  tubo_cor: string;
  fibra_numero_no_tubo: number;
  fibra_cor: string;
}

// Gera a numeração global -> tubo/fibra a partir da construção do cabo.
// Suporta construção uniforme (N tubos x M fibras cada) — para
// construção personalizada (tubos com quantidades diferentes), usar
// generateFibersFromConstrucao.
export function generateFibersUniform(tubos: number, fibrasPorTubo: number): FiberSpec[] {
  const out: FiberSpec[] = [];
  let global = 1;
  for (let t = 1; t <= tubos; t++) {
    for (let f = 1; f <= fibrasPorTubo; f++) {
      out.push({
        numero_global: global,
        tubo_numero: t,
        tubo_cor: colorForIndex(t),
        fibra_numero_no_tubo: f,
        fibra_cor: colorForIndex(f),
      });
      global++;
    }
  }
  return out;
}

export function generateFibersFromConstrucao(
  construcao: { tubo: number; fibras: number }[],
): FiberSpec[] {
  const out: FiberSpec[] = [];
  let global = 1;
  for (const { tubo, fibras } of construcao) {
    for (let f = 1; f <= fibras; f++) {
      out.push({
        numero_global: global,
        tubo_numero: tubo,
        tubo_cor: colorForIndex(tubo),
        fibra_numero_no_tubo: f,
        fibra_cor: colorForIndex(f),
      });
      global++;
    }
  }
  return out;
}

// Item 15: cálculo automático das perdas. Potências em dBm (negativas).
// Perda = potência antes - potência depois (sempre positiva se houver
// perda real; negativa sinaliza ganho impossível -> alerta no chamador).
export function calcLossDb(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return Math.round((before - after) * 100) / 100;
}

export type LossClassification =
  | "dentro_esperado"
  | "atencao"
  | "critico"
  | "incompativel"
  | "ausente";

export function classifyLoss(
  lossDb: number | null,
  nominalDb: number | null,
  toleranceDb: number | null,
): LossClassification {
  if (lossDb === null) return "ausente";
  if (lossDb < 0) return "incompativel";
  if (nominalDb === null || toleranceDb === null) return "dentro_esperado";
  const max = nominalDb + toleranceDb;
  if (lossDb <= nominalDb) return "dentro_esperado";
  if (lossDb <= max) return "atencao";
  return "critico";
}

// Item 1/11: monta a frase de rota completa a partir dos dados
// selecionados pelo técnico — nunca inventa dado que não veio do cadastro.
export function describeConnection(input: {
  caboOrigemCodigo: string;
  fibraGlobal: number;
  tuboNumero: number;
  tuboCor: string;
  fibraCor: string;
  splitterCodigo: string;
  splitterTipo: string;
  portaNumero: number;
  portaCor: string;
  caboDestinoCodigo?: string | null;
  fibraDestinoGlobal?: number | null;
  fibraDestinoTuboCor?: string | null;
  fibraDestinoCor?: string | null;
  ctoCodigo?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(
    `Fibra ${input.fibraGlobal} do cabo ${input.caboOrigemCodigo} (tubo ${input.tuboNumero} ${input.tuboCor}, fibra ${input.fibraCor}) alimenta a entrada do splitter ${input.splitterCodigo} ${input.splitterTipo}.`,
  );
  if (input.caboDestinoCodigo && input.fibraDestinoGlobal) {
    parts.push(
      `A saída ${input.portaNumero} ${input.portaCor} do splitter ${input.splitterCodigo} está fusionada na fibra ${input.fibraDestinoGlobal} (tubo ${input.fibraDestinoTuboCor ?? "?"}, fibra ${input.fibraDestinoCor ?? "?"}) do cabo ${input.caboDestinoCodigo}${input.ctoCodigo ? `, que alimenta a CTO ${input.ctoCodigo}` : ""}.`,
    );
  } else if (input.ctoCodigo) {
    parts.push(`A saída ${input.portaNumero} ${input.portaCor} alimenta diretamente a CTO ${input.ctoCodigo}.`);
  }
  return parts.join(" ");
}

export const OUTPUT_STATE_LABEL: Record<string, string> = {
  livre: "Livre",
  reserva: "Reserva",
  cto: "Alimentando CTO",
  ceo: "Alimentando CEO",
  splitter_secundario: "Alimentando splitter secundário",
  rompida: "Rompida",
  sem_sinal: "Sem sinal",
  desativada: "Desativada",
  nao_identificado: "Destino não identificado",
};

export const FIBER_STATE_LABEL: Record<string, string> = {
  ativa: "Ativa",
  disponivel: "Disponível",
  reserva: "Reserva",
  passagem: "Passagem",
  alimentadora_splitter: "Alimentadora de splitter",
  saida_splitter: "Saída de splitter",
  alimentando_cto: "Alimentando CTO",
  alimentando_ceo: "Alimentando outra CEO",
  rompida: "Rompida",
  atenuada: "Atenuada",
  sem_sinal: "Sem sinal",
  ocupada_sem_identificacao: "Ocupada sem identificação",
  nao_utilizada: "Não utilizada",
  abandonada: "Abandonada",
  em_manutencao: "Em manutenção",
};
