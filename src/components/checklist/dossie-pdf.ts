import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ChecklistRow, FotoRow } from "@/lib/checklist-schema";
import { buildChecklistPdfBlob } from "./checklist-pdf";
import { buildInstalacaoPdfBlob } from "./instalacao-pdf";
import { getChecklistCounterproof } from "@/lib/customer-counterproof.functions";
import {
  getDiagnosticDownloadUrl,
  listDiagnosticReports,
  type DiagnosticReportRow,
} from "@/lib/webi-diagnostic.functions";
import {
  getCaseDossieBundle,
  type DossieBundle,
  type DossieRevision,
} from "@/lib/warehouse-dossie.functions";

const TEST_STAGE_LABEL: Record<string, string> = {
  before_change: "Antes da troca",
  after_ont_change: "Depois da troca da ONT",
  noc_retest: "Reteste NOC",
  additional_test: "Teste adicional",
};

const SERVICE_STAGE_LABEL: Record<string, string> = {
  initial: "Atendimento inicial",
  pre_change: "Pré-troca",
  post_ont_change: "Pós-troca da ONT",
  noc_retest: "Reteste NOC",
  additional_test: "Teste adicional",
};

interface Params {
  row: ChecklistRow;
  fotos: FotoRow[];
  tecnicoNome: string;
  assinatura: string | null;
  publicUrl?: string | null;
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
  {
    title,
    lines,
  }: {
    title: string;
    lines: string[];
  },
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
  page.drawText(title, {
    x: 40,
    y: 805,
    size: 22,
    font,
    color: rgb(1, 1, 1),
  });

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

async function fetchDiagnosticById(id: string): Promise<ArrayBuffer | null> {
  try {
    const { url } = await getDiagnosticDownloadUrl({ data: { reportId: id } });
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

async function fetchDiagnosticFromUrl(url: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Adiciona uma revisão completa ao PDF consolidado: cabeçalho separador,
 * checklist da revisão (com fotos/assinatura próprias) e diagnósticos ativos
 * vinculados àquela revisão. Não mistura evidências entre revisões.
 */
async function appendRevisionBlock(
  merged: PDFDocument,
  {
    revision,
    total,
    index,
    publicUrl,
    revisionSignedFotos,
  }: {
    revision: DossieRevision;
    total: number;
    index: number;
    publicUrl?: string | null;
    /**
     * Fotos já com URLs assinadas (bundle). Quando indefinido, cai no caminho
     * normal do checklist-pdf que assina pelo cliente do usuário logado.
     */
    revisionSignedFotos?: DossieRevision["fotos"];
  },
) {
  const { checklist, tecnico, diagnostics } = revision;
  const rev = checklist.revision_number ?? 1;
  const stageLabel = SERVICE_STAGE_LABEL[checklist.service_stage] ?? checklist.service_stage;
  const finalizadoEm = checklist.finalizado_em
    ? new Date(checklist.finalizado_em).toLocaleString("pt-BR")
    : "—";
  const numero = checklist.numero_publico ?? checklist.codigo_validacao ?? checklist.id.slice(0, 8);
  let counterproof = null;
  try {
    const cp = await getChecklistCounterproof({ data: { checklistId: checklist.id } });
    counterproof = cp && "status" in cp && cp.status === "validated" ? cp : null;
  } catch {
    // O dossiê continua sendo gerado mesmo quando o perfil não pode consultar a Contra-Prova.
  }

  await makeSectionPage(
    merged,
    `Revisão R${rev} de ${total} — ${stageLabel}`,
    [
      `Checklist ${numero}`,
      `Técnico: ${tecnico?.full_name || tecnico?.email || "—"}`,
      `Finalizado em: ${finalizadoEm}`,
      checklist.revision_reason ? `Motivo: ${checklist.revision_reason}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );

  // Sob a hood usamos o PDF renderer padrão. Se recebemos fotos já assinadas
  // (fluxo do almoxarifado, RLS não deixa o usuário assinar direto), passamos
  // um shim que sobrescreve signedFotoUrl mapeando por storage_path.
  const fotos: FotoRow[] = revisionSignedFotos ?? [];
  const originalFetch = globalThis.fetch;

  let checklistBlob: Blob;
  try {
    if (revisionSignedFotos) {
      const map = new Map<string, string | null>();
      for (const f of revisionSignedFotos) map.set(f.storage_path, f.signed_url);
      // Monkey-patch temporário: signedFotoUrl usa supabase.storage.createSignedUrl
      // no cliente do usuário e falha para o almoxarife. Injetamos as URLs aqui.
      (
        globalThis as unknown as { __dossieSignedFotoMap?: Map<string, string | null> }
      ).__dossieSignedFotoMap = map;
    }
    checklistBlob =
      checklist.tipo === "instalacao"
        ? await buildInstalacaoPdfBlob({
            row: checklist as unknown as ChecklistRow,
            tecnicoNome: tecnico?.full_name || tecnico?.email || "",
            assinatura: tecnico?.assinatura ?? null,
            publicUrl: publicUrl ?? null,
            counterproof,
          })
        : await buildChecklistPdfBlob({
            row: checklist as unknown as ChecklistRow,
            fotos: fotos.length ? fotos : [],
            tecnicoNome: tecnico?.full_name || tecnico?.email || "",
            assinatura: tecnico?.assinatura ?? null,
            publicUrl: publicUrl ?? null,
            counterproof,
          });
  } finally {
    delete (globalThis as unknown as { __dossieSignedFotoMap?: Map<string, string | null> })
      .__dossieSignedFotoMap;
    globalThis.fetch = originalFetch;
  }

  const bytes = await checklistBlob.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => merged.addPage(p));

  // Diagnósticos da revisão em ordem cronológica.
  const active = diagnostics
    .filter((d) => d.status === "active")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (let i = 0; i < active.length; i++) {
    const d = active[i];
    await makeSectionPage(
      merged,
      `Diagnóstico ${i + 1} de ${active.length} — R${rev}`,
      `${TEST_STAGE_LABEL[d.test_stage] ?? d.test_stage} · ${d.original_filename}`,
    );
    const buf =
      "signed_url" in d && (d as DossieRevision["diagnostics"][number]).signed_url
        ? await fetchDiagnosticFromUrl((d as DossieRevision["diagnostics"][number]).signed_url)
        : await fetchDiagnosticById(d.id);
    if (!buf) continue;
    try {
      const embed = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pgs = await merged.copyPages(embed, embed.getPageIndices());
      pgs.forEach((p) => merged.addPage(p));
    } catch (e) {
      console.warn("Falha ao mesclar diagnóstico", d.id, e);
      void index;
    }
  }
}

function bundleCoverLines(bundle: DossieBundle) {
  const first = bundle.revisions[0]?.checklist;
  const activeDiags = bundle.revisions.reduce(
    (acc, r) => acc + r.diagnostics.filter((d) => d.status === "active").length,
    0,
  );
  return [
    `Documento consolidado do atendimento`,
    ``,
    `Provedor: ${bundle.provider.name || bundle.provider.slug}`,
    `Ticket da troca: ${bundle.ticket?.ticket_code ?? "—"}`,
    `Número público: ${first?.numero_publico ?? "—"}`,
    `Código de validação (R1): ${first?.codigo_validacao ?? "—"}`,
    `Cliente: ${first?.cliente ?? bundle.ticket?.client_name ?? "—"}`,
    `OS: ${first?.os ?? bundle.ticket?.service_order ?? "—"}`,
    `Cidade: ${first?.cidade ?? bundle.ticket?.city ?? "—"}`,
    `Técnico: ${bundle.revisions[0]?.tecnico?.full_name ?? bundle.ticket?.technician_name ?? "—"}`,
    ``,
    `Peças anexadas:`,
    `  • ${bundle.revisions.length} revisão(ões) do checklist`,
    `  • ${activeDiags} relatório(s) do Webi Diagnostic`,
    ``,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
  ];
}

/**
 * Ordem cronológica das revisões (R1 → Rn). Extraído para permitir testes.
 */
export function orderRevisionsForDossie(revisions: DossieRevision[]): DossieRevision[] {
  return [...revisions].sort(
    (a, b) => (a.checklist.revision_number ?? 1) - (b.checklist.revision_number ?? 1),
  );
}

/**
 * Gera o dossiê completo a partir de um bundle já carregado (fluxo
 * almoxarifado/admin). Todas as revisões, fotos, assinaturas e diagnósticos
 * ativos entram no mesmo PDF, cada revisão delimitada por uma folha
 * separadora. Diagnósticos revogados são descartados.
 */
export async function buildCaseDossieBlobFromBundle(
  bundle: DossieBundle,
  { publicUrl }: { publicUrl?: string | null } = {},
): Promise<Blob> {
  const merged = await PDFDocument.create();
  await makeCoverPage(merged, {
    title: "Dossiê Técnico Webifibra",
    lines: bundleCoverLines(bundle),
  });

  const ordered = orderRevisionsForDossie(bundle.revisions);
  for (let i = 0; i < ordered.length; i++) {
    await appendRevisionBlock(merged, {
      revision: ordered[i],
      index: i,
      total: ordered.length,
      publicUrl,
      revisionSignedFotos: ordered[i].fotos,
    });
  }

  const bytes = await merged.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export async function downloadCaseDossieFromBundle(
  bundle: DossieBundle,
  { publicUrl }: { publicUrl?: string | null } = {},
) {
  const blob = await buildCaseDossieBlobFromBundle(bundle, { publicUrl });
  const first = bundle.revisions[0]?.checklist;
  const key =
    bundle.ticket?.ticket_code ||
    first?.numero_publico ||
    first?.codigo_validacao ||
    bundle.case_id.slice(0, 8);
  const nome = `dossie-${key}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function generateDossiePdf({
  row,
  fotos,
  tecnicoNome,
  assinatura,
  diagnostics,
  publicUrl,
  scope = "case",
  filenamePrefix,
}: Params) {
  // scope="case" agora consolida TODAS as revisões do atendimento.
  if (scope === "case") {
    const caseId = (row as unknown as { case_id?: string }).case_id ?? row.id;
    const bundle = await getCaseDossieBundle({ data: { caseId } });
    const blob = await buildCaseDossieBlobFromBundle(bundle, { publicUrl });
    const first = bundle.revisions[0]?.checklist;
    const key =
      bundle.ticket?.ticket_code ||
      first?.numero_publico ||
      row.numero_publico ||
      row.codigo_validacao ||
      row.id.slice(0, 8);
    const prefix = filenamePrefix ?? "dossie";
    const nome = `${prefix}-${key}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  // scope="revision": só esta revisão + diagnósticos vinculados a ela.
  const activeDiags = diagnostics
    .filter((d) => d.status === "active")
    .filter((d) => d.checklist_id === row.id);

  const checklistBlob =
    row.tipo === "instalacao"
      ? await buildInstalacaoPdfBlob({ row, tecnicoNome, assinatura, publicUrl })
      : await buildChecklistPdfBlob({ row, fotos, tecnicoNome, assinatura, publicUrl });

  const merged = await PDFDocument.create();
  await makeCoverPage(merged, {
    title: "Dossiê Técnico Webifibra",
    lines: [
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
      `  • Checklist técnico (R${(row as unknown as { revision_number?: number }).revision_number ?? 1})`,
      `  • ${activeDiags.length} relatório(s) do Webi Diagnostic`,
      ``,
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    ],
  });

  await makeSectionPage(
    merged,
    "Checklist Técnico",
    `Somente esta versão (R${(row as unknown as { revision_number?: number }).revision_number ?? 1})`,
  );
  const checklistBytes = await checklistBlob.arrayBuffer();
  const checklistDoc = await PDFDocument.load(checklistBytes);
  const cPages = await merged.copyPages(checklistDoc, checklistDoc.getPageIndices());
  cPages.forEach((p) => merged.addPage(p));

  for (let i = 0; i < activeDiags.length; i++) {
    const d = activeDiags[i];
    await makeSectionPage(
      merged,
      `Diagnóstico ${i + 1} de ${activeDiags.length}`,
      `${TEST_STAGE_LABEL[d.test_stage] ?? d.test_stage} · ${d.original_filename}`,
    );
    const buf = await fetchDiagnosticById(d.id);
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
  const prefix = filenamePrefix ?? "versao";
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
  void listDiagnosticReports; // reserva import p/ dependentes existentes
}

/** Baixa apenas o PDF do checklist desta versão, sem fotos extras nem diagnósticos. */
export async function downloadChecklistOnly({
  row,
  fotos,
  tecnicoNome,
  assinatura,
  publicUrl,
}: Omit<Params, "diagnostics" | "scope" | "filenamePrefix">) {
  const blob =
    row.tipo === "instalacao"
      ? await buildInstalacaoPdfBlob({ row, tecnicoNome, assinatura, publicUrl })
      : await buildChecklistPdfBlob({ row, fotos, tecnicoNome, assinatura, publicUrl });
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
