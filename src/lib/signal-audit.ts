import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const SIGNAL_CITIES = ["Telêmaco Borba", "Imbaú", "Tibagi"] as const;
export type SignalCity = (typeof SIGNAL_CITIES)[number];
export type SignalStatus = "aberto" | "em_andamento" | "encerrado";
export type SignalIssueKind = "desequilibrio" | "sinal_ruim" | "ambos";
export type SignalSeverity = "alto" | "critico";

export type SignalCause =
  | "ont"
  | "conector"
  | "acoplador"
  | "splitter"
  | "rede"
  | "fusao"
  | "fibra_drop"
  | "cto_odb"
  | "porta_olt"
  | "patch_cord"
  | "atenuacao_externa"
  | "outro";

export const SIGNAL_CAUSES: Array<{ value: SignalCause; label: string; infra?: boolean }> = [
  { value: "ont", label: "ONT" },
  { value: "conector", label: "Conector" },
  { value: "acoplador", label: "Acoplador" },
  { value: "splitter", label: "Splitter" },
  { value: "rede", label: "Rede / infraestrutura", infra: true },
  { value: "fusao", label: "Fusão", infra: true },
  { value: "fibra_drop", label: "Fibra / drop" },
  { value: "cto_odb", label: "CTO / ODB", infra: true },
  { value: "porta_olt", label: "Porta PON / OLT", infra: true },
  { value: "patch_cord", label: "Patch cord" },
  { value: "atenuacao_externa", label: "Atenuação externa", infra: true },
  { value: "outro", label: "Outro" },
];

export const SIGNAL_DIFFERENCE_THRESHOLD_DB = 3;
export const SIGNAL_LOW_THRESHOLD_DBM = -25;
export const SIGNAL_CRITICAL_THRESHOLD_DBM = -28;
export const SIGNAL_CRITICAL_DIFFERENCE_DB = 6;

export interface ParsedSignalRow {
  sn: string;
  onu_external_id: string;
  onu_type: string;
  customer_name: string;
  olt: string;
  board: string;
  port: string;
  allocated_onu: string;
  zone: string;
  address: string;
  odb: string;
  odb_port: string;
  city: SignalCity;
  signal_1310: number;
  signal_1490: number;
  difference_db: number;
  issue_kind: SignalIssueKind;
  severity: SignalSeverity;
  source_file: string;
}

export interface SignalImport {
  id: string;
  city: SignalCity;
  source_name: string;
  source_files: string[];
  plate_count: number;
  source_row_count: number;
  valid_row_count: number;
  flagged_row_count: number;
  difference_threshold_db: number;
  low_signal_threshold_dbm: number;
  city_counts: Record<string, number>;
  created_at: string;
}

export interface SignalCase extends Omit<ParsedSignalRow, "source_file"> {
  id: string;
  latest_import_id: string;
  present_in_latest_import: boolean;
  status: SignalStatus;
  cause: SignalCause | null;
  notes: string | null;
  hubsoft_os: string | null;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  final_signal_1310: number | null;
  final_signal_1490: number | null;
  final_difference_db: number | null;
  recurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  started_at: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface SignalEvent {
  id: string;
  signal_case_id: string;
  status: SignalStatus;
  cause: SignalCause | null;
  notes: string | null;
  hubsoft_os: string | null;
  assigned_technician_name: string | null;
  created_at: string;
}

export interface SignalCsvPreview {
  sourceRows: number;
  validRows: number;
  rows: ParsedSignalRow[];
  cityCounts: Record<string, number>;
  sourceFiles: string[];
}

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }

  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifySignal(signal1310: number, signal1490: number) {
  const difference = Math.round(Math.abs(signal1310 - signal1490) * 100) / 100;
  const hasDifference = difference > SIGNAL_DIFFERENCE_THRESHOLD_DB;
  const hasLowSignal =
    signal1310 <= SIGNAL_LOW_THRESHOLD_DBM || signal1490 <= SIGNAL_LOW_THRESHOLD_DBM;
  if (!hasDifference && !hasLowSignal) return null;

  const issue_kind: SignalIssueKind = hasDifference
    ? hasLowSignal
      ? "ambos"
      : "desequilibrio"
    : "sinal_ruim";
  const severity: SignalSeverity =
    Math.min(signal1310, signal1490) <= SIGNAL_CRITICAL_THRESHOLD_DBM ||
    difference >= SIGNAL_CRITICAL_DIFFERENCE_DB
      ? "critico"
      : "alto";
  return { difference_db: difference, issue_kind, severity };
}

export function parseSmartOltCsv(
  text: string,
  options: { city: SignalCity; sourceFile?: string },
): SignalCsvPreview {
  const matrix = parseCsv(text);
  if (matrix.length < 2) throw new Error("O CSV está vazio ou sem cabeçalho.");

  const indexes = new Map(matrix[0].map((header, index) => [normalizeHeader(header), index]));
  const required = ["sn", "name", "olt", "signal1310", "signal1490"];
  const missing = required.filter((header) => !indexes.has(header));
  if (missing.length) {
    throw new Error("O arquivo não contém as colunas SN, Name, OLT, Signal 1310 e Signal 1490.");
  }

  const value = (row: string[], header: string) => (row[indexes.get(header) ?? -1] ?? "").trim();
  const deduped = new Map<string, ParsedSignalRow>();
  let validRows = 0;
  const sourceFile = options.sourceFile?.trim() || "arquivo.csv";

  for (const row of matrix.slice(1)) {
    const signal1310 = toNumber(value(row, "signal1310"));
    const signal1490 = toNumber(value(row, "signal1490"));
    if (signal1310 === null || signal1490 === null) continue;
    validRows += 1;

    const classification = classifySignal(signal1310, signal1490);
    if (!classification) continue;

    const sn = value(row, "sn");
    const customerName = value(row, "name");
    if (!sn || !customerName) continue;
    const parsed: ParsedSignalRow = {
      sn,
      onu_external_id: value(row, "onuexternalid"),
      onu_type: value(row, "onutype"),
      customer_name: customerName,
      olt: value(row, "olt"),
      board: value(row, "board"),
      port: value(row, "port"),
      allocated_onu: value(row, "allocatedonu"),
      zone: value(row, "zone"),
      address: value(row, "address"),
      odb: value(row, "odbsplitter"),
      odb_port: value(row, "odbport"),
      city: options.city,
      signal_1310: signal1310,
      signal_1490: signal1490,
      ...classification,
      source_file: sourceFile,
    };

    const previous = deduped.get(sn);
    if (
      !previous ||
      previous.severity !== "critico" && parsed.severity === "critico" ||
      parsed.difference_db > previous.difference_db
    ) {
      deduped.set(sn, parsed);
    }
  }

  const rows = Array.from(deduped.values());
  if (!rows.length) {
    throw new Error("Nenhum cliente com sinal ≤ -25 dBm ou diferença acima de 3 dB foi encontrado.");
  }

  return {
    sourceRows: matrix.length - 1,
    validRows,
    rows,
    cityCounts: { [options.city]: rows.length },
    sourceFiles: [sourceFile],
  };
}

export function mergeSignalPreviews(previews: SignalCsvPreview[], city: SignalCity): SignalCsvPreview {
  const deduped = new Map<string, ParsedSignalRow>();
  for (const preview of previews) {
    for (const row of preview.rows) {
      const current = deduped.get(row.sn);
      if (!current || current.severity !== "critico" && row.severity === "critico" || row.difference_db > current.difference_db)
        deduped.set(row.sn, { ...row, city });
    }
  }
  const rows = Array.from(deduped.values());
  return {
    sourceRows: previews.reduce((sum, item) => sum + item.sourceRows, 0),
    validRows: previews.reduce((sum, item) => sum + item.validRows, 0),
    rows,
    cityCounts: { [city]: rows.length },
    sourceFiles: Array.from(new Set(previews.flatMap((item) => item.sourceFiles))),
  };
}

// Os tipos Supabase são regenerados pelo projeto a partir do schema remoto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const signalDb = supabase as any;

export async function listSignalImports(): Promise<SignalImport[]> {
  const { data, error } = await signalDb.from("signal_imports").select("*").order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []).map((item: Record<string, unknown>) => ({
    ...item,
    source_files: Array.isArray(item.source_files) ? item.source_files : [],
    city_counts: item.city_counts as Record<string, number>,
  })) as SignalImport[];
}

export async function listSignalCases(): Promise<SignalCase[]> {
  const all: SignalCase[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await signalDb
      .from("signal_cases")
      .select("*")
      .order("present_in_latest_import", { ascending: false })
      .order("severity", { ascending: true })
      .order("difference_db", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as SignalCase[];
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

export async function listSignalEvents(sinceISO: string): Promise<SignalEvent[]> {
  const { data, error } = await signalDb
    .from("signal_case_events")
    .select("id, signal_case_id, status, cause, notes, hubsoft_os, assigned_technician_name, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SignalEvent[];
}

export async function importSignalAudit(input: {
  city: SignalCity;
  sourceName: string;
  preview: SignalCsvPreview;
}) {
  const { data, error } = await signalDb.rpc("import_signal_audit", {
    _city: input.city,
    _source_name: input.sourceName,
    _source_files: input.preview.sourceFiles as unknown as Json,
    _source_row_count: input.preview.sourceRows,
    _valid_row_count: input.preview.validRows,
    _rows: input.preview.rows.map(({ source_file: _sourceFile, ...row }) => row) as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function updateSignalCase(input: {
  id: string;
  status: SignalStatus;
  cause: SignalCause | null;
  notes: string;
  hubsoftOs?: string | null;
  assignedTechnicianId?: string | null;
  assignedTechnicianName?: string | null;
  finalSignal1310?: number | null;
  finalSignal1490?: number | null;
}) {
  const { data, error } = await signalDb.rpc("update_signal_case", {
    _case_id: input.id,
    _status: input.status,
    _cause: input.cause,
    _notes: input.notes,
    _hubsoft_os: input.hubsoftOs ?? null,
    _assigned_technician_id: input.assignedTechnicianId ?? null,
    _assigned_technician_name: input.assignedTechnicianName ?? null,
    _final_signal_1310: input.finalSignal1310 ?? null,
    _final_signal_1490: input.finalSignal1490 ?? null,
  });
  if (error) throw error;
  return data as SignalCase;
}

export function causeLabel(value: SignalCause | null) {
  if (!value) return "Não informada";
  return SIGNAL_CAUSES.find((cause) => cause.value === value)?.label ?? value;
}

export function causeNeedsInfra(value: SignalCause | null) {
  return Boolean(SIGNAL_CAUSES.find((cause) => cause.value === value)?.infra);
}

export function issueLabel(value: SignalIssueKind) {
  if (value === "ambos") return "Sinal ruim + desequilíbrio";
  if (value === "desequilibrio") return "Desequilíbrio > 3 dB";
  return "Sinal ≤ -25 dBm";
}
