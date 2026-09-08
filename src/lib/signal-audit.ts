import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type SignalStatus = "aberto" | "em_andamento" | "encerrado";

export type SignalCause =
  | "ont"
  | "conector"
  | "splitter"
  | "fusao"
  | "fibra_drop"
  | "cto_odb"
  | "porta_olt"
  | "patch_cord"
  | "atenuacao_externa"
  | "outro";

export const SIGNAL_CAUSES: Array<{ value: SignalCause; label: string }> = [
  { value: "ont", label: "ONT" },
  { value: "conector", label: "Conector" },
  { value: "splitter", label: "Splitter" },
  { value: "fusao", label: "Fusão" },
  { value: "fibra_drop", label: "Fibra / drop" },
  { value: "cto_odb", label: "CTO / ODB" },
  { value: "porta_olt", label: "Porta PON / OLT" },
  { value: "patch_cord", label: "Patch cord" },
  { value: "atenuacao_externa", label: "Atenuação externa" },
  { value: "outro", label: "Outro" },
];

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
  city: string;
  signal_1310: number;
  signal_1490: number;
  difference_db: number;
}

export interface SignalImport {
  id: string;
  source_name: string;
  source_row_count: number;
  valid_row_count: number;
  flagged_row_count: number;
  threshold_db: number;
  city_counts: Record<string, number>;
  created_at: string;
}

export interface SignalCase extends ParsedSignalRow {
  id: string;
  latest_import_id: string;
  status: SignalStatus;
  cause: SignalCause | null;
  notes: string | null;
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
  created_at: string;
}

export interface SignalCsvPreview {
  sourceRows: number;
  validRows: number;
  rows: ParsedSignalRow[];
  cityCounts: Record<string, number>;
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
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function inferCity(olt: string, customerName: string, zone: string) {
  const normalizedOlt = olt.toLocaleUpperCase("pt-BR");
  if (normalizedOlt.includes("TELEMACO")) return "Telêmaco Borba";
  if (normalizedOlt.includes("TIBAGI")) return "Tibagi";
  if (normalizedOlt.includes("CASTRO")) return "Castro";

  const oltMatch = normalizedOlt.match(/OLT-([A-ZÀ-Ü_ ]+?)(?:-X?\d+|$)/);
  if (oltMatch?.[1]) return titleCase(oltMatch[1].replace(/_/g, " ").trim());

  const nameMatch = customerName.match(/-([A-ZÀ-Ü][A-ZÀ-Ü ]+)$/);
  if (nameMatch?.[1]) return titleCase(nameMatch[1].trim());

  const zoneMatch = zone.match(/-([A-ZÀ-Ü][A-ZÀ-Ü ]+)$/);
  if (zoneMatch?.[1]) return titleCase(zoneMatch[1].trim());
  return "Não identificada";
}

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSmartOltCsv(text: string): SignalCsvPreview {
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

  for (const row of matrix.slice(1)) {
    const signal1310 = toNumber(value(row, "signal1310"));
    const signal1490 = toNumber(value(row, "signal1490"));
    if (signal1310 === null || signal1490 === null) continue;
    validRows += 1;

    const difference = Math.round(Math.abs(signal1310 - signal1490) * 100) / 100;
    if (difference <= 3) continue;

    const sn = value(row, "sn");
    const customerName = value(row, "name");
    if (!sn || !customerName) continue;
    const olt = value(row, "olt");
    const zone = value(row, "zone");
    const parsed: ParsedSignalRow = {
      sn,
      onu_external_id: value(row, "onuexternalid"),
      onu_type: value(row, "onutype"),
      customer_name: customerName,
      olt,
      board: value(row, "board"),
      port: value(row, "port"),
      allocated_onu: value(row, "allocatedonu"),
      zone,
      address: value(row, "address"),
      odb: value(row, "odbsplitter"),
      odb_port: value(row, "odbport"),
      city: inferCity(olt, customerName, zone),
      signal_1310: signal1310,
      signal_1490: signal1490,
      difference_db: difference,
    };

    const previous = deduped.get(sn);
    if (!previous || previous.difference_db < difference) deduped.set(sn, parsed);
  }

  const rows = Array.from(deduped.values());
  if (!rows.length) {
    throw new Error("Nenhum cliente com diferença acima de 3 dB foi encontrado.");
  }

  const cityCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.city] = (counts[row.city] ?? 0) + 1;
    return counts;
  }, {});

  return {
    sourceRows: matrix.length - 1,
    validRows,
    rows,
    cityCounts,
  };
}

// Os tipos Supabase são regenerados pelo projeto a partir do schema remoto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const signalDb = supabase as any;

export async function listSignalImports(): Promise<SignalImport[]> {
  const { data, error } = await signalDb
    .from("signal_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((item: Record<string, unknown>) => ({
    ...item,
    city_counts: item.city_counts as Record<string, number>,
  })) as SignalImport[];
}

export async function listSignalCases(importId: string): Promise<SignalCase[]> {
  const all: SignalCase[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await signalDb
      .from("signal_cases")
      .select("*")
      .eq("latest_import_id", importId)
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
    .select("id, signal_case_id, status, cause, notes, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SignalEvent[];
}

export async function importSignalAudit(input: { sourceName: string; preview: SignalCsvPreview }) {
  const { data, error } = await signalDb.rpc("import_signal_audit", {
    _source_name: input.sourceName,
    _source_row_count: input.preview.sourceRows,
    _valid_row_count: input.preview.validRows,
    _rows: input.preview.rows as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function updateSignalCase(input: {
  id: string;
  status: SignalStatus;
  cause: SignalCause | null;
  notes: string;
}) {
  const { data, error } = await signalDb.rpc("update_signal_case", {
    _case_id: input.id,
    _status: input.status,
    _cause: input.cause,
    _notes: input.notes,
  });
  if (error) throw error;
  return data as SignalCase;
}

export function causeLabel(value: SignalCause | null) {
  if (!value) return "Não informada";
  return SIGNAL_CAUSES.find((cause) => cause.value === value)?.label ?? value;
}
