/**
 * Lógica pura do relatório de Remapeamento de CTO/NAP.
 *
 * Fica separada do componente react-pdf para poder ser testada sem renderizar
 * e para que o formulário use exatamente as mesmas regras de pendência do PDF.
 */
import type { ChecklistRow, RemapPort, RemapeamentoData } from "@/lib/checklist-schema";
import { computeSplitterStats, type SplitterStats } from "@/lib/remapeamento-fibers";

export type RemapDocStatus = "concluido" | "pendencia" | "incompleto";

export interface RemapPendency {
  code: string;
  label: string;
  /** Pendência impeditiva: bloqueia a finalização e a conclusão positiva. */
  blocking: boolean;
}

export interface RemapPortSummary {
  total: number;
  ocupadas: number;
  livres: number;
  reservadas: number;
  passantes: number;
  nao_identificadas: number;
}

export interface RemapReport {
  status: RemapDocStatus;
  statusLabel: string;
  pendencies: RemapPendency[];
  blockingPendencies: RemapPendency[];
  conclusion: string;
  stats: SplitterStats;
  ports: RemapPort[];
  portSummary: RemapPortSummary;
  portPages: RemapPort[][];
}

const STATUS_LABEL: Record<RemapDocStatus, string> = {
  concluido: "CONCLUÍDO",
  pendencia: "REGISTRO COM PENDÊNCIA",
  incompleto: "INCOMPLETO",
};

export function splitterPortCount(d: RemapeamentoData): number {
  return (d.portas ?? []).length;
}

export function summarizePorts(ports: RemapPort[]): RemapPortSummary {
  return {
    total: ports.length,
    ocupadas: ports.filter((p) => p.status === "ocupada").length,
    livres: ports.filter((p) => p.status === "livre").length,
    reservadas: ports.filter((p) => p.status === "reserva").length,
    passantes: ports.filter((p) => p.passante_trocado === "sim" || p.passante_trocado === "nao")
      .length,
    nao_identificadas: ports.filter(
      (p) => p.status === "nao_identificado" || p.status === "nao_identificada",
    ).length,
  };
}

/** Quebra as portas em blocos por página (cabeçalho da tabela repetido em cada bloco). */
export function chunkPorts(ports: RemapPort[], first = 22, rest = 30): RemapPort[][] {
  if (ports.length === 0) return [];
  const pages: RemapPort[][] = [ports.slice(0, first)];
  let i = first;
  while (i < ports.length) {
    pages.push(ports.slice(i, i + rest));
    i += rest;
  }
  return pages;
}

/** Pendências de negócio — usadas tanto pelo PDF quanto pela validação do formulário. */
export function remapPendencies(d: RemapeamentoData): RemapPendency[] {
  const list: RemapPendency[] = [];
  const fusao = d.fusao ?? { necessaria: null, itens: [] };
  if (fusao.necessaria === "sim" && (fusao.itens ?? []).length === 0) {
    list.push({
      code: "fusao_sem_detalhe",
      label: "Fusão indicada como necessária, mas nenhuma fibra foi detalhada.",
      blocking: true,
    });
  }
  if (!d.identificacao?.cto_codigo?.trim()) {
    list.push({ code: "sem_cto", label: "Código da CTO/NAP não informado.", blocking: true });
  }
  if (!d.splitter?.tipo) {
    list.push({ code: "sem_splitter", label: "Tipo do splitter não informado.", blocking: true });
  }
  const localizado = d.localizacao?.ativo?.confirmed || !!d.localizacao?.confirmada;
  if (!localizado) {
    list.push({
      code: "sem_localizacao",
      label: "Localização da CTO não confirmada em campo.",
      blocking: true,
    });
  }
  if (!d.resultado?.estado) {
    list.push({ code: "sem_resultado", label: "Resultado do remapeamento não informado.", blocking: false });
  }
  if (d.resultado?.pendencia?.trim()) {
    list.push({ code: "pendencia_tecnico", label: d.resultado.pendencia.trim(), blocking: false });
  }
  return list;
}

/** Mensagens curtas para bloquear a finalização no formulário. */
export function remapBlockingMessages(d: RemapeamentoData): string[] {
  return remapPendencies(d)
    .filter((p) => p.blocking)
    .map((p) => p.label);
}

function conclusionFor(
  status: RemapDocStatus,
  d: RemapeamentoData,
  blocking: RemapPendency[],
): string {
  if (status === "pendencia") {
    const fusao = blocking.some((p) => p.code === "fusao_sem_detalhe");
    return fusao
      ? "Remapeamento registrado com pendência: fusão sem detalhamento."
      : "Remapeamento registrado com pendência técnica.";
  }
  if (status === "incompleto") return "Registro incompleto: dados obrigatórios ausentes.";
  return d.resultado?.estado === "sim"
    ? "CTO remapeada integralmente."
    : "CTO remapeada parcialmente.";
}

export function buildRemapReport(d: RemapeamentoData): RemapReport {
  const ports = d.portas ?? [];
  const pendencies = remapPendencies(d);
  const blocking = pendencies.filter((p) => p.blocking);
  const status: RemapDocStatus = blocking.some((p) => p.code === "fusao_sem_detalhe")
    ? "pendencia"
    : blocking.length > 0
      ? "incompleto"
      : !d.resultado?.estado
        ? "incompleto"
        : "concluido";

  return {
    status,
    statusLabel: STATUS_LABEL[status],
    pendencies,
    blockingPendencies: blocking,
    conclusion: conclusionFor(status, d, blocking),
    stats: computeSplitterStats(d),
    ports,
    portSummary: summarizePorts(ports),
    portPages: chunkPorts(ports),
  };
}

/** Título curto usado no cabeçalho/rodapé do documento. */
export function remapDocumentCode(row: Pick<ChecklistRow, "rmap_code" | "numero_publico" | "id">) {
  return row.rmap_code || row.numero_publico || row.id.slice(0, 8).toUpperCase();
}

/** Legenda neutra quando a foto não tem descrição cadastrada. */
export function evidenceCaption(
  categoria: string,
  legenda: string | null | undefined,
  index: number,
): string {
  if (legenda?.trim()) return legenda.trim();
  const base =
    categoria === "antes"
      ? "Antes da intervenção"
      : categoria === "depois"
        ? "Depois da intervenção"
        : "Evidência";
  return `${base} — foto ${index + 1}`;
}
