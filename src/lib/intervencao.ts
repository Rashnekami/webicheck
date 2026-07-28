import { z } from "zod";

import type { TipoIntervencao } from "./checklist-schema";

export const CAUSA_OPCOES: Record<TipoIntervencao, { value: string; label: string }[]> = {
  rompimento: [
    { value: "acidente_veicular", label: "Acidente veicular / colisão em poste" },
    { value: "poda_arvore", label: "Poda de árvore / queda de galho" },
    { value: "obra_terceiros", label: "Obra de terceiros / escavação" },
    { value: "vandalismo", label: "Vandalismo ou furto de cabo" },
    { value: "intemperie", label: "Intempérie (vento, tempestade, descarga)" },
    { value: "desgaste", label: "Desgaste natural / cabo fadigado" },
    { value: "outro", label: "Outro" },
  ],
  readequacao: [
    { value: "remanejamento_poste", label: "Remanejamento de poste / concessionária" },
    { value: "reserva_tecnica", label: "Ajuste de reserva técnica" },
    { value: "rota_inadequada", label: "Rota inadequada / cabo tensionado" },
    { value: "expansao", label: "Expansão ou reforço de capacidade" },
    { value: "padronizacao", label: "Padronização de infraestrutura" },
    { value: "outro", label: "Outro" },
  ],
  melhoria_sinal: [
    { value: "atenuacao_alta", label: "Atenuação alta na fibra" },
    { value: "conector_sujo", label: "Conector sujo ou danificado" },
    { value: "fusao_ruim", label: "Fusão com perda elevada" },
    { value: "curvatura", label: "Curvatura/dobra excessiva no cabo" },
    { value: "splitter_saturado", label: "Splitter saturado ou inadequado" },
    { value: "outro", label: "Outro" },
  ],
};

export const URGENCIA_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const ESTADO_LABEL: Record<string, string> = {
  resolvido: "Resolvido",
  paliativo: "Paliativo",
  pendente: "Pendente",
};

export const PONTO_LABEL: Record<string, string> = {
  INICIO: "Início da rota",
  ROMPIMENTO: "Ponto de rompimento",
  FUSAO: "Fusão executada",
  FIM: "Fim da rota",
  POSTE: "Poste",
  CTO: "CTO/NAP",
  CEO: "CEO",
  CAIXA_EMENDA: "Caixa de emenda",
  OUTRO: "Outro ponto",
};

export const PONTO_COLOR: Record<string, string> = {
  INICIO: "#22c55e",
  ROMPIMENTO: "#e11d48",
  FUSAO: "#f59e0b",
  FIM: "#3b82f6",
  POSTE: "#a855f7",
  CTO: "#06b6d4",
  CEO: "#14b8a6",
  CAIXA_EMENDA: "#8b5cf6",
  OUTRO: "#94a3b8",
};

export const intervencaoAiSchema = z.object({
  diagnostico_provavel: z.string(),
  causa_raiz: z.string(),
  recomendacao: z.enum([
    "concluir_intervencao",
    "refazer_fusao",
    "escalar_noc",
    "retornar_ao_local",
    "abrir_readequacao",
    "nenhuma_acao",
  ]),
  justificativa: z.string(),
  inconsistencias: z.array(z.string()),
  resumo_tecnico: z.string(),
});

export type IntervencaoAiResult = z.infer<typeof intervencaoAiSchema>;

export const INTERVENCAO_RECOMENDACAO_LABEL: Record<string, string> = {
  concluir_intervencao: "Concluir a intervenção",
  refazer_fusao: "Refazer a fusão",
  escalar_noc: "Escalar para o NOC",
  retornar_ao_local: "Retornar ao local",
  abrir_readequacao: "Abrir readequação de rede",
  nenhuma_acao: "Nenhuma ação adicional",
};

/** Distância Haversine em metros. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Extensão total da rota somando os segmentos na ordem cadastrada. */
export function routeLengthMeters(points: Array<{ lat: number; lng: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineMeters(points[i - 1], points[i]);
  return Math.round(total);
}

function num(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Ganho de sinal (dB) entre antes e depois. Positivo = melhora. */
export function signalGainDb(antes?: string, depois?: string): number | null {
  const a = num(antes);
  const d = num(depois);
  if (a === null || d === null) return null;
  return Math.round((d - a) * 100) / 100;
}

export function parseDecimal(value: string | null | undefined): number | null {
  return num(value);
}
