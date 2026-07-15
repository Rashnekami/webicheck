// Serviço de exportação do pacote para PowerPoint.
// Gera um ZIP com múltiplos CSVs preparados para colar diretamente nos
// gráficos do PowerPoint. Usa a mesma camada de agregação do dashboard.

import JSZip from "jszip";
import {
  aggregate,
  formatMonthBR,
  periodLabel,
  type CanonRecord,
  type DashboardFilters,
} from "@/lib/dashboard-analytics";

// ---------- Utilidades CSV ----------

const SEP = ";";
const EOL = "\r\n";
const BOM = "\ufeff";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(SEP);
}

function buildCsv(header: string[], rows: unknown[][]): string {
  const out: string[] = [csvRow(header)];
  for (const r of rows) out.push(csvRow(r));
  return BOM + out.join(EOL) + EOL;
}

function pctBR(part: number, total: number): string {
  if (!total) return "0,00";
  return ((part * 100) / total).toFixed(2).replace(".", ",");
}

function numBR(n: number, digits = 2): string {
  return n.toFixed(digits).replace(".", ",");
}

// ---------- Opções ----------

export interface PresentationExportOptions {
  records: CanonRecord[]; // já filtrados pelo dashboard
  filters: DashboardFilters;
  filterMetadata: {
    cidade?: string;
    tecnicoNome?: string;
    tipo?: string;
    analistaNoc?: string;
    status?: string;
  };
  empresa?: string;
}

// ---------- Geração ----------

export async function generatePresentationZip(
  opts: PresentationExportOptions,
): Promise<Blob> {
  const zip = new JSZip();
  const agg = aggregate(opts.records);
  const period = periodLabel(opts.filters.startISO, opts.filters.endISO);
  const now = new Date();
  const geradoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  // 00 - metadados
  zip.file(
    "00_metadados.csv",
    buildCsv(
      ["campo", "valor"],
      [
        ["Empresa", opts.empresa || "Webifibra"],
        ["Período inicial", period.startBR],
        ["Período final", period.endBR],
        ["Gerado em", geradoEm],
        ["Fuso horário", "America/Sao_Paulo"],
        ["Cidade selecionada", opts.filterMetadata.cidade || "Todas"],
        ["Técnico selecionado", opts.filterMetadata.tecnicoNome || "Todos"],
        ["Tipo selecionado", opts.filterMetadata.tipo || "Todos"],
        ["Analista NOC selecionado", opts.filterMetadata.analistaNoc || "Todos"],
        ["Status da troca", opts.filterMetadata.status || "Todos"],
        ["Registros considerados", opts.records.length],
      ],
    ),
  );

  // 01 - resumo KPIs
  const kpiPeriod = `${period.startBR} a ${period.endBR}`;
  zip.file(
    "01_resumo_kpis.csv",
    buildCsv(
      ["ordem", "indicador", "valor", "unidade", "periodo"],
      [
        [1, "Checklists de validação de ONT", agg.totalOnt, "un", kpiPeriod],
        [2, "Trocas de ONT realmente realizadas", agg.totalTrocas, "un", kpiPeriod],
        [3, "Validações encerradas sem troca", agg.totalSemTroca, "un", kpiPeriod],
        [4, "Validações sem informação de troca", agg.totalNaoInformado, "un", kpiPeriod],
        [5, "Instalações", agg.totalInstalacoes, "un", kpiPeriod],
        [6, "Autorizações do NOC", agg.totalAutorizacoes, "un", kpiPeriod],
        [
          7,
          "Trocas não autorizadas pelo NOC",
          Math.max(agg.totalTrocas - agg.totalAutorizacoes, 0),
          "un",
          kpiPeriod,
        ],
        [8, "Taxa de autorização do NOC", numBR(agg.taxaAutorizacao), "%", kpiPeriod],
        [9, "Cidades com troca realizada", agg.cidadesComTroca.length, "un", kpiPeriod],
        [10, "Técnicos que realizaram trocas", agg.tecnicosComTroca.length, "un", kpiPeriod],
      ],
    ),
  );

  // 02 - principais problemas
  const totalOcorrencias = agg.sintomas.reduce((s, x) => s + x.value, 0);
  const sintomasFull = allSymptomsFromRecords(agg.validacoes);
  zip.file(
    "02_principais_problemas.csv",
    buildCsv(
      ["ordem", "problema", "quantidade", "percentual"],
      sintomasFull.map((s, i) => [
        i + 1,
        s.name,
        s.value,
        pctBR(s.value, totalOcorrencias || 1),
      ]),
    ),
  );

  // 03 - modelos mais trocados (todos, não só top 8)
  const modelosFull = countMap(agg.trocas.map((r) => r.modeloOntRetirada));
  const totalModelos = modelosFull.reduce((s, x) => s + x.value, 0);
  zip.file(
    "03_modelos_mais_trocados.csv",
    buildCsv(
      ["ordem", "modelo_retirado", "quantidade", "percentual"],
      modelosFull.map((m, i) => [
        i + 1,
        m.name || "(não informado)",
        m.value,
        pctBR(m.value, totalModelos || 1),
      ]),
    ),
  );

  // 04 - analistas NOC (todos os que autorizaram)
  const analistasFull = countMap(agg.autorizacoesNoc.map((r) => r.analistaNocNome));
  const totalAnal = analistasFull.reduce((s, x) => s + x.value, 0);
  zip.file(
    "04_analistas_noc.csv",
    buildCsv(
      ["ordem", "analista_noc", "autorizacoes", "percentual"],
      analistasFull.map((a, i) => [
        i + 1,
        a.name || "(sem nome)",
        a.value,
        pctBR(a.value, totalAnal || 1),
      ]),
    ),
  );

  // 05 - técnicos (trocas realizadas)
  const tecnicosFull = countMap(agg.trocas.map((r) => r.tecnicoNome));
  const totalTec = tecnicosFull.reduce((s, x) => s + x.value, 0);
  zip.file(
    "05_tecnicos.csv",
    buildCsv(
      ["ordem", "tecnico", "trocas_realizadas", "percentual"],
      tecnicosFull.map((t, i) => [
        i + 1,
        t.name,
        t.value,
        pctBR(t.value, totalTec || 1),
      ]),
    ),
  );

  // 06 - cidades (trocas realizadas)
  const cidadesFull = countMap(agg.trocas.map((r) => r.cidade || "(sem cidade)"));
  const totalCid = cidadesFull.reduce((s, x) => s + x.value, 0);
  zip.file(
    "06_cidades.csv",
    buildCsv(
      ["ordem", "cidade", "trocas_realizadas", "percentual"],
      cidadesFull.map((c, i) => [
        i + 1,
        c.name,
        c.value,
        pctBR(c.value, totalCid || 1),
      ]),
    ),
  );

  // 07 - motivos por cidade
  zip.file(
    "07_motivos_por_cidade.csv",
    buildCsv(
      ["cidade", "principal_problema", "quantidade", "percentual_na_cidade"],
      agg.motivosPorCidade.map((r) => [
        r.cidade,
        r.principal,
        r.quantidade,
        numBR(r.percentualNaCidade),
      ]),
    ),
  );

  // 08 - evolução mensal
  zip.file(
    "08_evolucao_mensal.csv",
    buildCsv(
      [
        "mes",
        "validacoes_ont",
        "trocas_realizadas",
        "sem_troca",
        "instalacoes",
        "autorizacoes_noc",
        "taxa_autorizacao",
      ],
      agg.evolucaoMensal.map((r) => [
        formatMonthBR(r.monthKey),
        r.validacoes,
        r.trocas,
        r.semTroca,
        r.instalacoes,
        r.autorizacoes,
        numBR(r.taxaAutorizacao),
      ]),
    ),
  );

  // 09 - base anonimizada
  const dateFmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  zip.file(
    "09_base_anonimizada.csv",
    buildCsv(
      [
        "data",
        "tipo",
        "tecnico",
        "cidade",
        "troca_realizada",
        "modelo_retirado",
        "modelo_instalado",
        "sintomas",
        "analista_noc",
        "noc_autorizada",
      ],
      opts.records.map((r) => [
        r.finalizadoEm ? dateFmt.format(new Date(r.finalizadoEm)) : "",
        r.tipo === "instalacao" ? "Instalação" : "Validação de ONT",
        r.tecnicoNome,
        r.cidade,
        r.trocaRealizada === true
          ? "Sim"
          : r.trocaRealizada === false
            ? "Não"
            : "Não informado",
        r.modeloOntRetirada,
        r.modeloOntInstalada,
        r.sintomas.join(" | "),
        r.analistaNocNome,
        r.nocAutorizada === true
          ? "Sim"
          : r.nocAutorizada === false
            ? "Não"
            : "",
      ]),
    ),
  );

  return zip.generateAsync({ type: "blob" });
}

export function presentationZipFilename(
  filters: DashboardFilters,
): string {
  const p = periodLabel(filters.startISO, filters.endISO);
  return `webifibra_apresentacao_${p.fileSlug}.zip`;
}

// ---------- Helpers ----------

function countMap(list: string[]): { name: string; value: number }[] {
  const m: Record<string, number> = {};
  for (const raw of list) {
    const k = (raw ?? "").toString().trim();
    if (!k) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name, "pt-BR"),
    );
}

function allSymptomsFromRecords(
  records: CanonRecord[],
): { name: string; value: number }[] {
  const m: Record<string, number> = {};
  for (const r of records) {
    const seen = new Set<string>();
    for (const s of r.sintomas) {
      if (seen.has(s)) continue;
      seen.add(s);
      m[s] = (m[s] || 0) + 1;
    }
  }
  return Object.entries(m)
    .map(([name, value]) => ({ name, value }))
    .sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name, "pt-BR"),
    );
}
