/**
 * Auditoria de checklists — rubrica e verificações determinísticas.
 *
 * Duas camadas separadas de propósito:
 *
 * 1. `runDeterministicChecks` — o que dá para conferir por regra, sem IA:
 *    campo obrigatório vazio, foto faltando, medição ausente. É reprodutível,
 *    barato e é o que sustenta um apontamento numa conversa de feedback.
 * 2. A IA (ver checklist-audit.server.ts) — só o que exige leitura de texto:
 *    se o relato tem problema, diagnóstico, causa, ação e resultado; e se as
 *    respostas são coerentes entre si.
 *
 * Rubrica: vigência a partir de 2026-06-01, conforme definido com o supervisor.
 * Checklist finalizado antes disso não é auditado — o formulário ainda mudava,
 * e apontar campo que não existia na época seria injusto com o técnico.
 *
 * Compartilhado cliente/servidor — nada de servidor aqui.
 */

export const RUBRIC_VERSION = "2026-06";
/** Nenhum checklist finalizado antes desta data é auditado. */
export const RUBRIC_VALID_FROM = "2026-06-01";

export type AuditTipo =
  | "validacao_ont"
  | "instalacao"
  | "remapeamento_cto"
  | "rompimento"
  | "readequacao"
  | "melhoria_sinal";

export type FindingKind =
  | "ponto_positivo"
  | "ponto_atencao"
  | "inconsistencia"
  | "neutro"
  | "revisao_humana";

export type FindingConfidence = "baixo" | "medio" | "alto";

export interface AuditFinding {
  kind: FindingKind;
  /** Grupo do catálogo de avaliação a que o fato se relaciona. */
  category: string;
  /** Frase objetiva, sem adjetivo sobre a pessoa. */
  description: string;
  /** Caminhos em `dados` ou categorias de foto que sustentam o apontamento. */
  refs: string[];
  confidence: FindingConfidence;
  /** "regra" = verificação determinística; "ia" = leitura de texto. */
  origin: "regra" | "ia";
}

/* --------------------------------------------------------------- rubrica */

interface RequiredField {
  /** Caminho em `dados`, ex.: "teste_wifi.download". */
  path: string;
  label: string;
  category: string;
  /** Só exige o campo quando esta condição for verdadeira. */
  when?: (dados: any) => boolean; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface RubricDef {
  tipo: AuditTipo;
  requiredFields: RequiredField[];
  /** Categorias de foto exigidas para este tipo. */
  requiredPhotos: { categoria: string; label: string }[];
  minRelatoChars: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Lê "a.b.c" com segurança. */
export function pick(obj: any, path: string): unknown {
  return path.split(".").reduce((acc: any, key) => (acc == null ? acc : acc[key]), obj);
}

/** Vazio = null, undefined, "", "  ", [] ou {} sem chaves. */
export function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

const yes = (v: unknown) => v === "sim";

export const RUBRICS: Record<AuditTipo, RubricDef> = {
  validacao_ont: {
    tipo: "validacao_ont",
    minRelatoChars: 40,
    requiredFields: [
      { path: "relato", label: "Relato técnico", category: "evidencias" },
      {
        path: "resultado_final",
        label: "Resultado após o teste final",
        category: "tecnica",
      },
      // O teste cabeado só é exigido quando o próprio técnico marcou que se aplica.
      {
        path: "teste_cabeado.download",
        label: "Download do teste cabeado",
        category: "tecnica",
        when: (d) => yes(pick(d, "teste_cabeado.aplicabilidade")),
      },
      {
        path: "teste_cabeado.upload",
        label: "Upload do teste cabeado",
        category: "tecnica",
        when: (d) => yes(pick(d, "teste_cabeado.aplicabilidade")),
      },
      // Wi-Fi: exigido quando alguma rede foi marcada como testada.
      {
        path: "teste_wifi.download",
        label: "Download do teste Wi-Fi",
        category: "tecnica",
        when: (d) => Boolean(pick(d, "teste_wifi.rede_24") || pick(d, "teste_wifi.rede_5")),
      },
      // Troca de ONT exige o registro da autorização do NOC.
      {
        path: "noc.analista",
        label: "Analista do NOC que autorizou a troca",
        category: "tecnica",
        when: (d) => yes(pick(d, "resultado_final.encaminhado_noc")),
      },
      {
        path: "noc.protocolo",
        label: "Protocolo do NOC",
        category: "tecnica",
        when: (d) => yes(pick(d, "resultado_final.encaminhado_noc")),
      },
    ],
    requiredPhotos: [
      { categoria: "etiqueta", label: "Foto da etiqueta (modelo e serial)" },
    ],
  },

  instalacao: {
    tipo: "instalacao",
    minRelatoChars: 0,
    requiredFields: [
      { path: "respostas", label: "Respostas das 20 perguntas", category: "evidencias" },
      { path: "velocidade.download", label: "Download do teste final", category: "tecnica" },
      { path: "velocidade.upload", label: "Upload do teste final", category: "tecnica" },
    ],
    requiredPhotos: [{ categoria: "etiqueta", label: "Foto da etiqueta" }],
  },

  remapeamento_cto: {
    tipo: "remapeamento_cto",
    minRelatoChars: 0,
    requiredFields: [
      { path: "identificacao.cto_codigo", label: "Código da CTO", category: "evidencias" },
      { path: "splitter.tipo", label: "Tipo do splitter", category: "tecnica" },
      {
        path: "splitter.potencia_entrada_dbm",
        label: "Potência de entrada do splitter",
        category: "tecnica",
      },
      { path: "portas", label: "Mapeamento das portas", category: "tecnica" },
      { path: "resultado.estado", label: "Resultado do remapeamento", category: "evidencias" },
      {
        path: "localizacao.ativo",
        label: "Confirmação da posição da CTO no mapa",
        category: "evidencias",
      },
      // Se refez fusão, os itens têm que estar descritos.
      {
        path: "fusao.itens",
        label: "Detalhamento da fusão refeita",
        category: "tecnica",
        when: (d) => yes(pick(d, "fusao.necessaria")),
      },
    ],
    requiredPhotos: [
      { categoria: "antes", label: "Foto ANTES (interior da CTO)" },
      { categoria: "depois", label: "Foto DEPOIS (após organização)" },
      { categoria: "sinal_fibra", label: "Foto do sinal da fibra" },
    ],
  },

  rompimento: intervencaoRubric("rompimento"),
  readequacao: intervencaoRubric("readequacao"),
  melhoria_sinal: intervencaoRubric("melhoria_sinal"),
};

function intervencaoRubric(tipo: AuditTipo): RubricDef {
  return {
    tipo,
    minRelatoChars: 30,
    requiredFields: [
      { path: "contexto.descricao", label: "Descrição da ocorrência", category: "evidencias" },
      { path: "contexto.causa", label: "Causa identificada", category: "tecnica" },
      { path: "execucao.concluida", label: "Conclusão da execução", category: "tecnica" },
      { path: "resultado.estado", label: "Estado final", category: "tecnica" },
      { path: "sinal.antes_dbm", label: "Sinal antes (dBm)", category: "tecnica" },
      { path: "sinal.depois_dbm", label: "Sinal depois (dBm)", category: "tecnica" },
      {
        path: "otdr.medicoes",
        label: "Medições de OTDR",
        category: "tecnica",
        when: (d) => yes(pick(d, "otdr.realizado")),
      },
    ],
    requiredPhotos: [
      { categoria: "antes", label: "Foto ANTES" },
      { categoria: "depois", label: "Foto DEPOIS" },
    ],
  };
}

export function isAuditableTipo(tipo: string | null | undefined): tipo is AuditTipo {
  return Boolean(tipo && tipo in RUBRICS);
}

/** Um checklist só entra na auditoria se foi finalizado dentro da vigência. */
export function isWithinRubric(finalizadoEm: string | null | undefined): boolean {
  if (!finalizadoEm) return false;
  return finalizadoEm.slice(0, 10) >= RUBRIC_VALID_FROM;
}

/* --------------------------------------------------- verificações por regra */

export interface DeterministicInput {
  tipo: AuditTipo;
  dados: any;
  fotoCategorias: string[];
}

/**
 * Roda a rubrica. Só produz fatos verificáveis: campo exigido que está vazio,
 * foto exigida que não existe. Nunca opina sobre a pessoa.
 */
export function runDeterministicChecks(input: DeterministicInput): AuditFinding[] {
  const rubric = RUBRICS[input.tipo];
  if (!rubric) return [];
  const out: AuditFinding[] = [];
  const dados = input.dados ?? {};

  const faltando: string[] = [];
  for (const field of rubric.requiredFields) {
    if (field.when && !field.when(dados)) continue;
    if (isBlank(pick(dados, field.path))) {
      faltando.push(field.label);
      out.push({
        kind: "ponto_atencao",
        category: field.category,
        description: `O checklist foi finalizado sem o preenchimento de "${field.label}", campo obrigatório para este tipo de atendimento na rubrica vigente (${RUBRIC_VERSION}).`,
        refs: [`dados.${field.path}`],
        confidence: "alto",
        origin: "regra",
      });
    }
  }

  const categorias = new Set(input.fotoCategorias);
  for (const photo of rubric.requiredPhotos) {
    if (!categorias.has(photo.categoria)) {
      out.push({
        kind: "ponto_atencao",
        category: "evidencias",
        description: `Não foi localizada a evidência "${photo.label}", exigida para este tipo de atendimento.`,
        refs: [`foto.${photo.categoria}`],
        confidence: "alto",
        origin: "regra",
      });
    }
  }

  // Reconhecimento explícito quando está tudo certo. Um sistema que só aponta
  // erro não serve para uma conversa de feedback.
  if (faltando.length === 0 && out.length === 0) {
    out.push({
      kind: "ponto_positivo",
      category: "evidencias",
      description:
        "Todos os campos obrigatórios e as evidências fotográficas exigidas para este tipo de atendimento foram preenchidos.",
      refs: [],
      confidence: "alto",
      origin: "regra",
    });
  }

  return out;
}

/* ---------------------------------------------------------------- resumo */

export interface AuditSummary {
  total: number;
  completos: number;
  incompletos: number;
  pontosPositivos: number;
  pontosAtencao: number;
  inconsistencias: number;
  revisaoHumana: number;
}

export function summarize(findingsByChecklist: AuditFinding[][]): AuditSummary {
  const s: AuditSummary = {
    total: findingsByChecklist.length,
    completos: 0,
    incompletos: 0,
    pontosPositivos: 0,
    pontosAtencao: 0,
    inconsistencias: 0,
    revisaoHumana: 0,
  };
  for (const findings of findingsByChecklist) {
    const temAtencao = findings.some(
      (f) => f.kind === "ponto_atencao" || f.kind === "inconsistencia",
    );
    if (temAtencao) s.incompletos++;
    else s.completos++;
    for (const f of findings) {
      if (f.kind === "ponto_positivo") s.pontosPositivos++;
      if (f.kind === "ponto_atencao") s.pontosAtencao++;
      if (f.kind === "inconsistencia") s.inconsistencias++;
      if (f.kind === "revisao_humana") s.revisaoHumana++;
    }
  }
  return s;
}

export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  ponto_positivo: "Ponto positivo",
  ponto_atencao: "Ponto de atenção",
  inconsistencia: "Inconsistência",
  neutro: "Informação neutra",
  revisao_humana: "Necessita revisão humana",
};
