// Camada única de normalização e agregação usada pelo dashboard e pela
// exportação para PowerPoint. Se o número está aqui, tanto o gráfico quanto
// o CSV devem exibir exatamente o mesmo valor.

import type {
  ChecklistData,
  ChecklistRow,
  TipoChecklist,
} from "./checklist-schema";

// ---------- Rótulos ----------

export const SINTOMA_LABELS: Record<string, string> = {
  ont_nao_liga: "ONT não liga",
  ont_reinicia: "ONT reinicia",
  perde_internet: "Perde internet",
  internet_cai_pon_acesa: "Cai com PON acesa",
  los_acende: "LOS acende",
  wifi_5g_desaparece: "Wi-Fi 5 GHz some",
  wifi_ambas_desaparecem: "Ambas Wi-Fi somem",
  wifi_falha_cabo_ok: "Wi-Fi falha, cabo OK",
  lan_nao_funciona: "LAN não funciona",
  lentidao: "Lentidão",
};

// ---------- Normalização ----------

const CITY_ACCENT_MAP: Record<string, string> = {
  "telemaco borba": "Telêmaco Borba",
  "imbau": "Imbaú",
  "tibagi": "Tibagi",
  "ortigueira": "Ortigueira",
  "reservoa": "Reserva",
  "reserva": "Reserva",
  "curiuva": "Curiúva",
  "sao jeronimo da serra": "São Jerônimo da Serra",
  "ventania": "Ventania",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toTitleCase(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s
    .split(/\s+/)
    .map((w, i) =>
      w.length === 0
        ? w
        : small.has(w.toLowerCase()) && i > 0
          ? w.toLowerCase()
          : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function normalizeCity(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const key = stripDiacritics(cleaned).toLowerCase();
  if (CITY_ACCENT_MAP[key]) return CITY_ACCENT_MAP[key];
  return toTitleCase(cleaned);
}

// Modelos canônicos conhecidos (chave sem acento/espaço/hífen, minúscula)
const MODEL_CANON: Record<string, string> = {
  huaweix5: "Huawei X5",
  huaweiec6108v9c: "Huawei EC6108V9C",
  huaweihg8546m: "Huawei HG8546M",
  huaweihg8245h: "Huawei HG8245H",
  huaweieg8145v5: "Huawei EG8145V5",
  huaweieg8145x6: "Huawei EG8145X6",
  ztef670l: "ZTE F670L",
  ztef601: "ZTE F601",
  ztef660: "ZTE F660",
  fiberhomehg6145f: "Fiberhome HG6145F",
  intelbrasr1200: "Intelbras R1200",
};

export function normalizeModel(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const key = stripDiacritics(cleaned).toLowerCase().replace(/[\s\-_]+/g, "");
  if (MODEL_CANON[key]) return MODEL_CANON[key];
  // Fallback: uppercase preservando marca + modelo com espaços únicos
  return cleaned
    .split(/[\s\-]+/)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function normalizeBoolean(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (["sim", "true", "1", "yes", "y"].includes(s)) return true;
  if (["nao", "não", "false", "0", "no", "n"].includes(s)) return false;
  return null;
}

export function normalizePersonName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").trim();
}

export function splitSymptoms(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export function normalizeChecklistType(t: string | null | undefined): TipoChecklist {
  return t === "instalacao" ? "instalacao" : "validacao_ont";
}

// Data/hora em São Paulo
const TZ = "America/Sao_Paulo";
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const monthKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
});

export function convertToSaoPauloTime(iso: string | null | undefined): {
  date: string;
  dateTime: string;
  monthKey: string; // YYYY-MM
} {
  if (!iso) return { date: "", dateTime: "", monthKey: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", dateTime: "", monthKey: "" };
  const monthPartsSrc = monthKeyFmt.format(d); // ex: 2026-07
  return {
    date: dateFmt.format(d),
    dateTime: dateTimeFmt.format(d),
    monthKey: monthPartsSrc,
  };
}

export function formatMonthBR(monthKey: string): string {
  // "2026-07" -> "07/2026"
  const [y, m] = monthKey.split("-");
  return y && m ? `${m}/${y}` : monthKey;
}

// ---------- Registro canônico ----------

export interface CanonRecord {
  id: string;
  tipo: TipoChecklist;
  finalizadoEm: string | null;
  monthKey: string;
  tecnicoId: string;
  tecnicoNome: string;
  cidade: string;
  sintomas: string[];
  analistaNocId: string;
  analistaNocNome: string;
  nocAutorizada: boolean | null;
  trocaRealizada: boolean | null;
  modeloOntRetirada: string;
  serialOntRetirada: string;
  modeloOntInstalada: string;
  serialOntInstalada: string;
}

function symptomsFromDados(d: any): string[] {
  if (!d || typeof d !== "object") return [];
  const sintomaObj = (d as ChecklistData).sintoma;
  if (!sintomaObj || typeof sintomaObj !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(sintomaObj)) {
    if (v === true) out.push(SINTOMA_LABELS[k] || k);
  }
  return out;
}

export function toCanon(
  row: ChecklistRow,
  nomePorId: Map<string, string>,
): CanonRecord {
  const tipo = normalizeChecklistType(row.tipo);
  const d: any = row.dados ?? {};
  const nocAutorizadaRaw =
    tipo === "validacao_ont" ? (d?.noc?.autorizada ?? null) : null;
  const analistaNome =
    tipo === "validacao_ont"
      ? normalizePersonName(d?.noc?.analista)
      : "";
  return {
    id: row.id,
    tipo,
    finalizadoEm: row.finalizado_em,
    monthKey: convertToSaoPauloTime(row.finalizado_em).monthKey,
    tecnicoId: row.tecnico_id,
    tecnicoNome:
      nomePorId.get(row.tecnico_id) || row.tecnico_id.slice(0, 8),
    cidade: normalizeCity(row.cidade),
    sintomas: symptomsFromDados(d),
    analistaNocId: analistaNome.toLowerCase(),
    analistaNocNome: analistaNome,
    nocAutorizada: normalizeBoolean(nocAutorizadaRaw),
    trocaRealizada: normalizeBoolean(row.troca_realizada),
    modeloOntRetirada: normalizeModel(
      row.modelo_ont_retirada || (tipo === "validacao_ont" ? row.modelo : ""),
    ),
    serialOntRetirada:
      row.serial_ont_retirada || (tipo === "validacao_ont" ? row.serial ?? "" : "") || "",
    modeloOntInstalada: normalizeModel(row.modelo_ont_instalada),
    serialOntInstalada: row.serial_ont_instalada ?? "",
  };
}

// ---------- Filtros ----------

export interface DashboardFilters {
  startISO: string; // inclusive
  endISO: string; // exclusive
  cidade?: string; // já normalizada
  tecnicoId?: string;
  tipo?: TipoChecklist | "todos";
  analistaNoc?: string; // já normalizado (nome)
  status?: "todos" | "com_troca" | "sem_troca" | "nao_informado";
}

export function applyFilters(
  records: CanonRecord[],
  f: DashboardFilters,
): CanonRecord[] {
  const start = new Date(f.startISO).getTime();
  const end = new Date(f.endISO).getTime();
  return records.filter((r) => {
    if (!r.finalizadoEm) return false;
    const t = new Date(r.finalizadoEm).getTime();
    if (isNaN(t) || t < start || t >= end) return false;
    if (f.cidade && r.cidade !== f.cidade) return false;
    if (f.tecnicoId && r.tecnicoId !== f.tecnicoId) return false;
    if (f.tipo && f.tipo !== "todos" && r.tipo !== f.tipo) return false;
    if (f.analistaNoc && r.analistaNocNome !== f.analistaNoc) return false;
    if (f.status && f.status !== "todos") {
      if (r.tipo !== "validacao_ont") return false;
      if (f.status === "com_troca" && r.trocaRealizada !== true) return false;
      if (f.status === "sem_troca" && r.trocaRealizada !== false) return false;
      if (f.status === "nao_informado" && r.trocaRealizada !== null) return false;
    }
    return true;
  });
}

// ---------- Agregações ----------

export interface Aggregations {
  validacoes: CanonRecord[]; // tipo validacao_ont
  trocas: CanonRecord[]; // trocaRealizada === true
  semTroca: CanonRecord[]; // trocaRealizada === false
  naoInformado: CanonRecord[]; // trocaRealizada === null e tipo=validacao_ont
  instalacoes: CanonRecord[];
  autorizacoesNoc: CanonRecord[]; // nocAutorizada === true
  totalOnt: number;
  totalInstalacoes: number;
  totalTrocas: number;
  totalSemTroca: number;
  totalNaoInformado: number;
  totalAutorizacoes: number;
  taxaAutorizacao: number; // 0..100
  cidadesComTroca: string[];
  tecnicosComTroca: string[];
  esteMes: number;
  sintomas: { name: string; value: number }[];
  modelos: { name: string; value: number }[];
  analistas: { name: string; value: number }[];
  tecnicos: { name: string; value: number }[];
  cidades: { name: string; value: number }[];
  motivosPorCidade: {
    cidade: string;
    principal: string;
    quantidade: number;
    total: number;
    percentualNaCidade: number;
  }[];
  evolucaoMensal: {
    monthKey: string;
    validacoes: number;
    trocas: number;
    semTroca: number;
    instalacoes: number;
    autorizacoes: number;
    taxaAutorizacao: number;
  }[];
}

function countBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of arr) {
    const k = key(x);
    if (!k) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function toSortedArr(
  m: Record<string, number>,
  limit?: number,
): { name: string; value: number }[] {
  const arr = Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "pt-BR"));
  return limit ? arr.slice(0, limit) : arr;
}

export function aggregate(records: CanonRecord[]): Aggregations {
  const validacoes = records.filter((r) => r.tipo === "validacao_ont");
  const instalacoes = records.filter((r) => r.tipo === "instalacao");
  const trocas = validacoes.filter((r) => r.trocaRealizada === true);
  const semTroca = validacoes.filter((r) => r.trocaRealizada === false);
  const naoInformado = validacoes.filter((r) => r.trocaRealizada === null);
  const autorizacoesNoc = validacoes.filter((r) => r.nocAutorizada === true);

  // Sintomas: cada checklist de validação (dentro dos filtros) conta cada
  // sintoma no máximo uma vez
  const sintomasCount: Record<string, number> = {};
  for (const r of validacoes) {
    const seen = new Set<string>();
    for (const s of r.sintomas) {
      if (seen.has(s)) continue;
      seen.add(s);
      sintomasCount[s] = (sintomasCount[s] || 0) + 1;
    }
  }

  const modelosCount = countBy(trocas, (r) => r.modeloOntRetirada);
  const analistasCount = countBy(autorizacoesNoc, (r) => r.analistaNocNome);
  const tecnicosCount = countBy(trocas, (r) => r.tecnicoNome);
  const cidadesCount = countBy(trocas, (r) => r.cidade || "(sem cidade)");

  // Motivos por cidade: baseados nas validações (o motivo/sintoma reflete
  // por que houve chamado), incluindo somente cidades com trocas realizadas
  const cidadeSintomas: Record<string, Record<string, number>> = {};
  const cidadeTotal: Record<string, number> = {};
  for (const r of validacoes) {
    const c = r.cidade || "(sem cidade)";
    if (!cidadeSintomas[c]) cidadeSintomas[c] = {};
    const seen = new Set<string>();
    for (const s of r.sintomas) {
      if (seen.has(s)) continue;
      seen.add(s);
      cidadeSintomas[c][s] = (cidadeSintomas[c][s] || 0) + 1;
      cidadeTotal[c] = (cidadeTotal[c] || 0) + 1;
    }
  }
  const motivosPorCidade = Object.entries(cidadeSintomas)
    .map(([cidade, syms]) => {
      const entries = Object.entries(syms).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
      );
      const top = entries[0];
      const total = cidadeTotal[cidade] || 0;
      return {
        cidade,
        principal: top ? top[0] : "—",
        quantidade: top ? top[1] : 0,
        total,
        percentualNaCidade: total > 0 && top ? (top[1] * 100) / total : 0,
      };
    })
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));

  // Evolução mensal
  const monthly: Record<string, {
    validacoes: number;
    trocas: number;
    semTroca: number;
    instalacoes: number;
    autorizacoes: number;
  }> = {};
  const ensure = (k: string) => {
    if (!monthly[k])
      monthly[k] = {
        validacoes: 0,
        trocas: 0,
        semTroca: 0,
        instalacoes: 0,
        autorizacoes: 0,
      };
    return monthly[k];
  };
  for (const r of records) {
    if (!r.monthKey) continue;
    const m = ensure(r.monthKey);
    if (r.tipo === "validacao_ont") m.validacoes++;
    if (r.tipo === "instalacao") m.instalacoes++;
    if (r.trocaRealizada === true) m.trocas++;
    if (r.trocaRealizada === false) m.semTroca++;
    if (r.nocAutorizada === true) m.autorizacoes++;
  }
  const evolucaoMensal = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, v]) => ({
      monthKey,
      ...v,
      taxaAutorizacao:
        v.validacoes > 0 ? (v.autorizacoes * 100) / v.validacoes : 0,
    }));

  const now = new Date();
  const ymNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const esteMes = trocas.filter((r) => r.monthKey === ymNow).length;

  return {
    validacoes,
    trocas,
    semTroca,
    naoInformado,
    instalacoes,
    autorizacoesNoc,
    totalOnt: validacoes.length,
    totalInstalacoes: instalacoes.length,
    totalTrocas: trocas.length,
    totalSemTroca: semTroca.length,
    totalNaoInformado: naoInformado.length,
    totalAutorizacoes: autorizacoesNoc.length,
    taxaAutorizacao:
      validacoes.length > 0
        ? (autorizacoesNoc.length * 100) / validacoes.length
        : 0,
    cidadesComTroca: Object.keys(cidadesCount).filter((c) => c !== "(sem cidade)"),
    tecnicosComTroca: Object.keys(tecnicosCount),
    esteMes,
    sintomas: toSortedArr(sintomasCount, 10),
    modelos: toSortedArr(modelosCount, 8),
    analistas: toSortedArr(analistasCount, 8),
    tecnicos: toSortedArr(tecnicosCount, 8),
    cidades: toSortedArr(cidadesCount, 8),
    motivosPorCidade,
    evolucaoMensal,
  };
}

// ---------- Períodos preset ----------

export type PeriodPreset = "mes_atual" | "mes_anterior" | "ultimos_30" | "personalizado";

export function computePeriod(preset: PeriodPreset, custom?: { start?: string; end?: string }): {
  startISO: string;
  endISO: string;
} {
  const now = new Date();
  if (preset === "mes_atual") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  if (preset === "mes_anterior") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  if (preset === "ultimos_30") {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }
  // personalizado
  const s = custom?.start ? new Date(custom.start + "T00:00:00") : new Date();
  const e = custom?.end
    ? new Date(custom.end + "T00:00:00")
    : new Date();
  const eEnd = new Date(e);
  eEnd.setDate(eEnd.getDate() + 1);
  return { startISO: s.toISOString(), endISO: eEnd.toISOString() };
}

export function periodLabel(startISO: string, endISO: string): {
  startBR: string;
  endBR: string;
  fileSlug: string;
} {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const eDisplay = new Date(e.getTime() - 24 * 3600 * 1000); // inclusive display
  const isoDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    return parts;
  };
  return {
    startBR: dateFmt.format(s),
    endBR: dateFmt.format(eDisplay),
    fileSlug: `${isoDate(s)}_a_${isoDate(eDisplay)}`,
  };
}
