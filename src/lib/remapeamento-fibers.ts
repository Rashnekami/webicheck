// Sequência TIA-598-C de cores de fibra óptica (12 cores).
// Acima de 12 portas, repete ciclicamente.
import type {
  RemapPort,
  RemapeamentoData,
  SplitterKind,
} from "@/lib/checklist-schema";

export interface FiberColor {
  slug: string;
  label: string;
  hex: string;
  ink: string; // cor de texto legível sobre o hex
}

export const FIBER_COLORS: FiberColor[] = [
  { slug: "azul", label: "Azul", hex: "#1e6bff", ink: "#ffffff" },
  { slug: "laranja", label: "Laranja", hex: "#ff8a1f", ink: "#0f172a" },
  { slug: "verde", label: "Verde", hex: "#1fbf5a", ink: "#0f172a" },
  { slug: "marrom", label: "Marrom", hex: "#7a4a1e", ink: "#ffffff" },
  { slug: "cinza", label: "Cinza", hex: "#8f98a8", ink: "#0f172a" },
  { slug: "branco", label: "Branco", hex: "#f5f7fb", ink: "#0f172a" },
  { slug: "vermelho", label: "Vermelho", hex: "#ef2f3c", ink: "#ffffff" },
  { slug: "preto", label: "Preto", hex: "#0b1220", ink: "#ffffff" },
  { slug: "amarelo", label: "Amarelo", hex: "#f4d21b", ink: "#0f172a" },
  { slug: "violeta", label: "Violeta", hex: "#7d3ec1", ink: "#ffffff" },
  { slug: "rosa", label: "Rosa", hex: "#ff6ea6", ink: "#0f172a" },
  { slug: "aqua", label: "Aqua", hex: "#26d9d1", ink: "#0f172a" },
];

export function getFiberColor(portIndex: number): FiberColor {
  return FIBER_COLORS[portIndex % FIBER_COLORS.length];
}

export function fiberColorBySlug(slug: string | null | undefined): FiberColor {
  const found = FIBER_COLORS.find((c) => c.slug === slug);
  return found ?? FIBER_COLORS[0];
}

export function portsForSplitter(kind: SplitterKind | null, custom?: number): RemapPort[] {
  const map: Record<SplitterKind, number> = { "1x4": 4, "1x8": 8, "1x16": 16, outro: custom ?? 0 };
  const count = kind ? map[kind] : 0;
  return Array.from({ length: count }, (_, i) => {
    const c = getFiberColor(i);
    return {
      numero: i + 1,
      cor: c.slug,
      status: "livre",
    } satisfies RemapPort;
  });
}

// Reconcilia porta atual com nova contagem preservando dados quando possível.
export function reconcilePorts(existing: RemapPort[], count: number): RemapPort[] {
  return Array.from({ length: count }, (_, i) => {
    const found = existing.find((p) => p.numero === i + 1);
    if (found) return found;
    const c = getFiberColor(i);
    return { numero: i + 1, cor: c.slug, status: "livre" as const };
  });
}

function parseDbm(raw?: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface SplitterStats {
  total: number;
  ocupadas: number;
  livres: number;
  nao_identificado: number;
  media_saida_dbm: number | null;
  melhor: { porta: number; dbm: number } | null;
  pior: { porta: number; dbm: number } | null;
  perda_media_db: number | null;
  delta_db: number | null;
  entrada_dbm: number | null;
}

export function computeSplitterStats(data: RemapeamentoData): SplitterStats {
  const portas = data.portas ?? [];
  const ocupadas = portas.filter((p) => p.status === "ocupada");
  const livres = portas.filter((p) => p.status === "livre").length;
  const naoId = portas.filter((p) => p.status === "nao_identificado").length;
  const readings = ocupadas
    .map((p) => ({ porta: p.numero, dbm: parseDbm(p.potencia_dbm) }))
    .filter((r): r is { porta: number; dbm: number } => r.dbm !== null);

  const entrada = parseDbm(data.splitter.potencia_entrada_dbm);
  if (readings.length === 0) {
    return {
      total: portas.length,
      ocupadas: ocupadas.length,
      livres,
      nao_identificado: naoId,
      media_saida_dbm: null,
      melhor: null,
      pior: null,
      perda_media_db: null,
      delta_db: null,
      entrada_dbm: entrada,
    };
  }
  const media = readings.reduce((s, r) => s + r.dbm, 0) / readings.length;
  const melhor = readings.reduce((b, r) => (r.dbm > b.dbm ? r : b), readings[0]);
  const pior = readings.reduce((b, r) => (r.dbm < b.dbm ? r : b), readings[0]);
  const perda = entrada !== null ? entrada - media : null;
  return {
    total: portas.length,
    ocupadas: ocupadas.length,
    livres,
    nao_identificado: naoId,
    media_saida_dbm: Math.round(media * 100) / 100,
    melhor,
    pior,
    perda_media_db: perda !== null ? Math.round(perda * 100) / 100 : null,
    delta_db: Math.round((melhor.dbm - pior.dbm) * 100) / 100,
    entrada_dbm: entrada,
  };
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
