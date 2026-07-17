// Helpers para o "código do checklist" exibido ao usuário e enviado ao
// Webi Diagnostic Agent. Uma revisão N>1 recebe o sufixo -R{N}.
// Exemplo: WEBICHECK20260001 (R1)   WEBICHECK20260001-R2 (R2)

export type StageMap = {
  initial: "before_change";
  pre_change: "before_change";
  post_ont_change: "after_ont_change";
  noc_retest: "noc_retest";
  additional_test: "additional_test";
};

export const SERVICE_TO_TEST_STAGE: Record<string, string> = {
  initial: "before_change",
  pre_change: "before_change",
  post_ont_change: "after_ont_change",
  noc_retest: "noc_retest",
  additional_test: "additional_test",
};

export function formatChecklistCode(row: {
  numero_publico?: string | null;
  codigo_validacao?: string | null;
  revision_number?: number | null;
}): string {
  const base = row.numero_publico || row.codigo_validacao || "";
  if (!base) return "";
  const rev = row.revision_number ?? 1;
  if (rev <= 1) return base;
  return `${base}-R${rev}`;
}

export interface ParsedCode {
  base: string;
  revision: number | null;
  kind: "numero_publico" | "codigo_validacao" | "unknown";
}

export function parseChecklistCode(raw: string): ParsedCode {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return { base: "", revision: null, kind: "unknown" };
  const m = cleaned.match(/^(.*?)(?:-R(\d+))?$/);
  const base = (m?.[1] ?? cleaned).trim();
  const rev = m?.[2] ? parseInt(m[2], 10) : null;
  let kind: ParsedCode["kind"] = "unknown";
  if (/^WEBICHECK\d+/i.test(base)) kind = "numero_publico";
  else if (/^WBF-/i.test(base)) kind = "codigo_validacao";
  return { base, revision: rev, kind };
}
