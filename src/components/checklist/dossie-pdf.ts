import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ChecklistRow, FotoRow } from "@/lib/checklist-schema";
import { buildChecklistPdfBlob } from "./checklist-pdf";
import { buildInstalacaoPdfBlob } from "./instalacao-pdf";
import {
  getDiagnosticDownloadUrl,
  type DiagnosticReportRow,
} from "@/lib/webi-diagnostic.functions";

const TEST_STAGE_LABEL: Record<string, string> = {
  before_change: "Antes da troca",
  after_ont_change: "Depois da troca da ONT",
  noc_retest: "Reteste NOC",
  additional_test: "Teste adicional",
};

interface Params {
  row: ChecklistRow;
  fotos: FotoRow[];
  tecnicoNome: string;
  assinatura: string | null;
  diagnostics: DiagnosticReportRow[];
  /**
   * "case" (default): inclui todos os diagnósticos ativos do atendimento.
   * "revision": inclui apenas os diagnósticos vinculados a este checklist.
   */
  scope?: "case" | "revision";
  filenamePrefix?: string;
}

async function makeCoverPage(
  pdf: PDFDocument,
  { row, diagCount }: { row: ChecklistRow; diagCount: number },
) {
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontR = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({
    x: 0,
    y: 780,
    width: 595.28,
    height: 62,
    color: rgb(0.07, 0.34, 0.6),
  });
  page.drawText("Dossiê Técnico Webifibra", {
    x: 40,
    y: 805,
    size: 22,
    font,
    color: rgb(1, 1, 1),
  });

  const lines: string[] = [
    `Documento consolidado do atendimento`,
    ``,
    `Número público: ${row.numero_publico ?? "-"}`,
    `Código de validação: ${row.codigo_validacao ?? "-"}`,
    `Cliente: ${row.cliente ?? "-"}`,
    `OS: ${row.os ?? "-"}`,
    `Cidade: ${row.cidade ?? "-"}`,
    `Data do atendimento: ${row.data_atendimento ?? "-"} ${row.hora_atendimento ?? ""}`.trim(),
    ``,
    `Peças anexadas:`,
    `  • Checklist técnico (versão atual)`,
    `  • ${diagCount} relatório(s) do Webi Diagnostic`,
    ``,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
  ];

  let y = 740;
  for (const l of lines) {
    page.drawText(l, {
      x: 40,
      y,
      size: 11,
      font: fontR,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 18;
  }

  page.drawText(
    "Este dossiê preserva as evidências do atendimento para fins de fiscalização e auditoria.",
    {
      x: 40,
      y: 40,
      size: 9,
      font: fontR,
      color: rgb(0.35, 0.35, 0.35),
    },
  );
}

async function makeSectionPage(pdf: PDFDocument, title: string, subtitle?: string) {
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontR = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({
    x: 0,
    y: 400,
    width: 595.28,
    height: 60,
    color: rgb(0.93, 0.95, 0.98),
  });
  page.drawText(title, {
    x: 40,
    y: 430,
    size: 20,
    font,
    color: rgb(0.07, 0.34, 0.6),
  });
  if (subtitle) {
    page.drawText(subtitle, {
      x: 40,
      y: 408,
      size: 11,
      font: fontR,
      color: rgb(0.25, 0.25, 0.25),
    });
  }
}

async function fetchDiagnostic(id: string): Promise<ArrayBuffer | null> {
  try {
    const { url } = await getDiagnosticDownloadUrl({ data: { reportId: id } });
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

export async function generateDossiePdf({
  row,
  fotos,
  tecnicoNome,
  assinatura,
  diagnostics,
  scope = "case",
  filenamePrefix,
}: Params) {
  const activeDiags = diagnostics
    .filter((d) => d.status === "active")
    .filter((d) => (scope === "revision" ? d.checklist_id === row.id : true));

  const checklistBlob =
    row.tipo === "instalacao"
      ? await buildInstalacaoPdfBlob({ row, tecnicoNome, assinatura })
      : await buildChecklistPdfBlob({ row, fotos, tecnicoNome, assinatura });

  const merged = await PDFDocument.create();
  await makeCoverPage(merged, { row, diagCount: activeDiags.length });

  // Checklist
  await makeSectionPage(
    merged,
    "Checklist Técnico",
    scope === "revision"
      ? `Somente esta versão (R${(row as unknown as { revision_number?: number }).revision_number ?? 1})`
      : "Versão atual do atendimento",
  );
  const checklistBytes = await checklistBlob.arrayBuffer();
  const checklistDoc = await PDFDocument.load(checklistBytes);
  const cPages = await merged.copyPages(checklistDoc, checklistDoc.getPageIndices());
  cPages.forEach((p) => merged.addPage(p));

  // Diagnostics
  for (let i = 0; i < activeDiags.length; i++) {
    const d = activeDiags[i];
    await makeSectionPage(
      merged,
      `Diagnóstico ${i + 1} de ${activeDiags.length}`,
      `${TEST_STAGE_LABEL[d.test_stage] ?? d.test_stage} · ${d.original_filename}`,
    );
    const buf = await fetchDiagnostic(d.id);
    if (!buf) continue;
    try {
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch (e) {
      console.warn("Falha ao mesclar diagnóstico", d.id, e);
    }
  }

  const bytes = await merged.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const prefix = filenamePrefix ?? (scope === "revision" ? "versao" : "dossie");
  const rev = (row as unknown as { revision_number?: number }).revision_number ?? 1;
  const revSuffix = rev > 1 ? `-R${rev}` : "";
  const nome = `${prefix}-${row.numero_publico || row.codigo_validacao || row.id.slice(0, 8)}${revSuffix}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Baixa apenas o PDF do checklist desta versão, sem fotos extras nem diagnósticos. */
export async function downloadChecklistOnly({
  row,
  fotos,
  tecnicoNome,
  assinatura,
}: Omit<Params, "diagnostics" | "scope" | "filenamePrefix">) {
  const blob =
    row.tipo === "instalacao"
      ? await buildInstalacaoPdfBlob({ row, tecnicoNome, assinatura })
      : await buildChecklistPdfBlob({ row, fotos, tecnicoNome, assinatura });
  const rev = (row as unknown as { revision_number?: number }).revision_number ?? 1;
  const revSuffix = rev > 1 ? `-R${rev}` : "";
  const nome = `checklist-${row.numero_publico || row.codigo_validacao || row.id.slice(0, 8)}${revSuffix}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

