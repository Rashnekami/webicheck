// Shape completo dos dados dinâmicos dos checklists (armazenados em JSONB)

export type YesNo = "sim" | "nao" | null;
export type TipoChecklist =
  | "validacao_ont"
  | "instalacao"
  | "remapeamento_cto"
  | "rompimento"
  | "readequacao"
  | "melhoria_sinal";

/** Tipos que compartilham o formulário unificado de intervenção de rede. */
export type TipoIntervencao = "rompimento" | "readequacao" | "melhoria_sinal";

export const TIPOS_INTERVENCAO: TipoIntervencao[] = [
  "rompimento",
  "readequacao",
  "melhoria_sinal",
];

export function isIntervencao(tipo: TipoChecklist): tipo is TipoIntervencao {
  return (TIPOS_INTERVENCAO as string[]).includes(tipo);
}


export interface StoredAiAnalysis {
  diagnostico_provavel: string;
  causa_raiz: string;
  recomendacao: string;
  justificativa: string;
  inconsistencias: string[];
  resumo_tecnico: string;
  gerado_em: string;
  modelo_ia: string;
  tipo_manutencao: string | null;
}

// -------- ONT (validação) --------
export interface ChecklistData {
  sintoma: {
    ont_nao_liga: boolean;
    ont_queimada: boolean;
    ont_danificada_cliente: boolean;
    ont_reinicia: boolean;
    perde_internet: boolean;
    internet_cai_pon_acesa: boolean;
    los_acende: boolean;
    wifi_5g_desaparece: boolean;
    wifi_ambas_desaparecem: boolean;
    wifi_falha_cabo_ok: boolean;
    lan_nao_funciona: boolean;
    lentidao: boolean;
    outro_texto: string;
    falha_presenciada: YesNo;
    horario: string;
  };
  validacao_fisica: {
    tomada: boolean;
    fonte: boolean;
    outra_tomada: boolean;
    outra_fonte: boolean;
    patch_cord: boolean;
    sem_dobras: boolean;
    luz_verde_ok: boolean;
    roseta_ok: boolean;
  };
  teste_cabeado: {
    aplicabilidade: YesNo;
    navegacao: boolean;
    ping: boolean;
    velocidade: boolean;
    cabo_substituido: boolean;
    download: string;
    upload: string;
    ping_ms: string;
    funcionou: boolean;
    apresentou_falha: boolean;
    ont_reiniciou: boolean;
    lan_falhou: boolean;
    nao_testado: boolean;
  };
  teste_wifi: {
    rede_24: boolean;
    rede_5: boolean;
    mais_aparelhos: boolean;
    cabo_funcionando: boolean;
    download: string;
    upload: string;
    ping_ms: string;
    apenas_5g_desaparece: boolean;
    ambas_desaparecem: boolean;
    sem_internet: boolean;
    um_aparelho: boolean;
    nao_reproduzida: boolean;
  };
  evidencias_marcadas: {
    etiqueta: boolean;
    leds: boolean;
    fonte: boolean;
    teste_cabeado: boolean;
    teste_wifi: boolean;
  };
  resultado_final: {
    permaneceu: boolean;
    parou: boolean;
    nao_reproduzida: boolean;
    encaminhado_noc: YesNo;
    interrompeu: YesNo;
    motivo: string;
    executar_diagnostico_pos_troca: boolean;
  };
  relato: string;
  tipo_manutencao?: string | null;
  ai_analysis?: StoredAiAnalysis | null;
  noc: {
    autorizada: YesNo;
    analista: string;
    data: string;
    hora: string;
    protocolo: string;
  };
}

export function emptyChecklistData(): ChecklistData {
  return {
    sintoma: {
      ont_nao_liga: false,
      ont_queimada: false,
      ont_danificada_cliente: false,
      ont_reinicia: false,
      perde_internet: false,
      internet_cai_pon_acesa: false,
      los_acende: false,
      wifi_5g_desaparece: false,
      wifi_ambas_desaparecem: false,
      wifi_falha_cabo_ok: false,
      lan_nao_funciona: false,
      lentidao: false,
      outro_texto: "",
      falha_presenciada: null,
      horario: "",
    },
    validacao_fisica: {
      tomada: false,
      fonte: false,
      outra_tomada: false,
      outra_fonte: false,
      patch_cord: false,
      sem_dobras: false,
      luz_verde_ok: false,
      roseta_ok: false,
    },
    teste_cabeado: {
      aplicabilidade: null,
      navegacao: false,
      ping: false,
      velocidade: false,
      cabo_substituido: false,
      download: "",
      upload: "",
      ping_ms: "",
      funcionou: false,
      apresentou_falha: false,
      ont_reiniciou: false,
      lan_falhou: false,
      nao_testado: false,
    },
    teste_wifi: {
      rede_24: false,
      rede_5: false,
      mais_aparelhos: false,
      cabo_funcionando: false,
      download: "",
      upload: "",
      ping_ms: "",
      apenas_5g_desaparece: false,
      ambas_desaparecem: false,
      sem_internet: false,
      um_aparelho: false,
      nao_reproduzida: false,
    },
    evidencias_marcadas: {
      etiqueta: false,
      leds: false,
      fonte: false,
      teste_cabeado: false,
      teste_wifi: false,
    },
    resultado_final: {
      permaneceu: false,
      parou: false,
      nao_reproduzida: false,
      encaminhado_noc: null,
      interrompeu: null,
      motivo: "",
      executar_diagnostico_pos_troca: false,
    },
    relato: "",
    tipo_manutencao: null,
    ai_analysis: null,
    noc: {
      autorizada: null,
      analista: "",
      data: "",
      hora: "",
      protocolo: "",
    },
  };
}

// -------- Instalação --------
export interface InstalacaoData {
  // Nova estrutura (v2): 20 perguntas sim/não indexadas por id (tq01..tq20)
  respostas: Record<string, "sim" | "nao">;
  velocidade: {
    download: string;
    upload: string;
    ping_ms: string;
  };
  observacoes: string;
  // Legado: mantidos como opcionais apenas para retrocompatibilidade de leitura
  itens?: Record<string, boolean>;
  assinatura_cliente?: string | null;
}

export function emptyInstalacaoData(): InstalacaoData {
  return {
    respostas: {},
    velocidade: { download: "", upload: "", ping_ms: "" },
    observacoes: "",
  };
}


// -------- Remapeamento de CTO/NAP --------
export type SplitterKind = "1x4" | "1x8" | "1x16" | "outro";
// "nao_identificado" mantido por retrocompatibilidade dos registros já salvos.
export type RemapPortStatus =
  | "ocupada"
  | "livre"
  | "reserva"
  | "nao_identificada"
  | "nao_identificado";

export interface RemapGpsPoint {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  captured_at?: string | null;
}

export interface RemapPort {
  numero: number;
  cor: string; // slug da cor, ex: "azul"
  cor_custom?: string | null;
  status: RemapPortStatus;
  cliente?: string;
  cliente_id?: string;
  potencia_dbm?: string; // string para permitir vazio/decimal com vírgula
  /** Indica se o passante daquela porta foi trocado durante o remapeamento. */
  passante_trocado?: YesNo;
}

export interface RemapFusaoItem {
  fibra: string;
  motivo: string;
  antes_dbm: string;
  depois_dbm: string;
}

export type MapAtivoTipo =
  | "CTO"
  | "CEO"
  | "CAIXA_EMENDA"
  | "POSTE"
  | "ROMPIMENTO"
  | "FUSAO"
  | "INICIO"
  | "FIM"
  | "OUTRO";

/** Ativo geográfico confirmado manualmente pelo técnico (nunca preenchido pelo GPS). */
export interface RemapAtivoLocation {
  tipo: MapAtivoTipo;
  lat: number;
  lng: number;
  confirmed: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
}

/** Metadados cartográficos — contra-prova técnica geográfica. */
export interface RemapMapMeta {
  map_provider: "arcgis";
  map_engine: "maplibre";
  basemap_style: string;
  zoom: number;
  gps_accuracy_m: number | null;
  distancia_tecnico_ativo_m: number | null;
}

/** Snapshot cartográfico gerado no backend (nunca screenshot do DOM). */
export interface MapSnapshotInfo {
  snapshot_path: string;
  provider: string;
  style: string;
  center_lat: number;
  center_lng: number;
  zoom: number;
  width: number;
  height: number;
  generated_at: string;
  sha256: string;
  revision_number: number;
}

export interface RemapeamentoData {
  identificacao: {
    setor: string;
    cto_codigo: string;
  };
  localizacao: {
    gps_original: RemapGpsPoint | null;
    /** Legado/espelho da posição do ativo — mantido para leitura retroativa. */
    confirmada: { lat: number; lng: number } | null;
    confirmada_em: string | null;
    distancia_m: number | null;
    ativo?: RemapAtivoLocation | null;
    meta?: RemapMapMeta | null;
    snapshot?: MapSnapshotInfo | null;
  };
  splitter: {
    tipo: SplitterKind | null;
    tipo_outro: string;
    potencia_entrada_dbm: string;
  };
  alimentacao: {
    cabo: string;
    tubo: string;
    fibra: string;
    cor_fibra: string;
    origem: string;
    observacao: string;
  };
  portas: RemapPort[];
  fusao: {
    necessaria: YesNo;
    itens: RemapFusaoItem[];
  };
  resultado: {
    estado: "sim" | "parcialmente" | null;
    pendencia: string;
  };
}

export function emptyRemapeamentoData(): RemapeamentoData {
  return {
    identificacao: { setor: "", cto_codigo: "" },
    localizacao: {
      gps_original: null,
      confirmada: null,
      confirmada_em: null,
      distancia_m: null,
      ativo: null,
      meta: null,
      snapshot: null,
    },
    splitter: { tipo: null, tipo_outro: "", potencia_entrada_dbm: "" },
    alimentacao: { cabo: "", tubo: "", fibra: "", cor_fibra: "", origem: "", observacao: "" },
    portas: [],
    fusao: { necessaria: null, itens: [] },
    resultado: { estado: null, pendencia: "" },
  };
}


// -------- Intervenções de rede (rompimento / readequação / melhoria de sinal) --------

export type IntervencaoUrgencia = "baixa" | "media" | "alta" | "critica";
export type IntervencaoEstado = "resolvido" | "paliativo" | "pendente";
export type OtdrMomento = "antes" | "depois";

/** Ponto georreferenciado da rota da intervenção, confirmado manualmente. */
export interface IntervencaoPonto {
  id: string;
  tipo: MapAtivoTipo;
  lat: number;
  lng: number;
  descricao: string;
  confirmed_at: string | null;
}

export interface OtdrMedicao {
  id: string;
  momento: OtdrMomento;
  fibra: string;
  distancia_km: string;
  atenuacao_db: string;
  perda_evento_db: string;
  observacao: string;
}

export interface OtdrLaudo {
  id: string;
  momento: OtdrMomento;
  storage_path: string;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface IntervencaoData {
  contexto: {
    descricao: string;
    causa: string;
    urgencia: IntervencaoUrgencia | null;
    afetados_estimados: string;
    inicio_interrupcao: string;
    fim_interrupcao: string;
    cto_codigo: string;
  };
  rota: {
    pontos: IntervencaoPonto[];
    extensao_estimada_m: string;
    gps_tecnico: RemapGpsPoint | null;
    meta: RemapMapMeta | null;
    snapshot: MapSnapshotInfo | null;
  };
  materiais: {
    cabo_tipo: string;
    cabo_metros: string;
    fusoes_qtd: string;
    conectores_qtd: string;
    postes_qtd: string;
    outros: string;
  };
  otdr: {
    realizado: YesNo;
    medicoes: OtdrMedicao[];
    laudos: OtdrLaudo[];
  };
  sinal: {
    antes_dbm: string;
    depois_dbm: string;
    cliente_afetado: string;
  };
  execucao: {
    equipe: string;
    inicio: string;
    fim: string;
    concluida: YesNo;
    pendencia: string;
  };
  resultado: {
    estado: IntervencaoEstado | null;
    observacoes: string;
  };
  ai_analysis?: StoredAiAnalysis | null;
}

export function emptyIntervencaoData(): IntervencaoData {
  return {
    contexto: {
      descricao: "",
      causa: "",
      urgencia: null,
      afetados_estimados: "",
      inicio_interrupcao: "",
      fim_interrupcao: "",
      cto_codigo: "",
    },
    rota: {
      pontos: [],
      extensao_estimada_m: "",
      gps_tecnico: null,
      meta: null,
      snapshot: null,
    },
    materiais: {
      cabo_tipo: "",
      cabo_metros: "",
      fusoes_qtd: "",
      conectores_qtd: "",
      postes_qtd: "",
      outros: "",
    },
    otdr: { realizado: null, medicoes: [], laudos: [] },
    sinal: { antes_dbm: "", depois_dbm: "", cliente_afetado: "" },
    execucao: { equipe: "", inicio: "", fim: "", concluida: null, pendencia: "" },
    resultado: { estado: null, observacoes: "" },
    ai_analysis: null,
  };
}

export type AnyChecklistData =
  | ChecklistData
  | InstalacaoData
  | RemapeamentoData
  | IntervencaoData;

export function emptyDadosFor(tipo: TipoChecklist): AnyChecklistData {
  if (tipo === "instalacao") return emptyInstalacaoData();
  if (tipo === "remapeamento_cto") return emptyRemapeamentoData();
  if (isIntervencao(tipo)) return emptyIntervencaoData();
  return emptyChecklistData();
}


export type ChecklistStatus = "rascunho" | "finalizado";

export interface ChecklistRow {
  id: string;
  tecnico_id: string;
  tipo: TipoChecklist;
  status: ChecklistStatus;
  os: string | null;
  cliente: string | null;
  cidade: string | null;
  endereco: string | null;
  plano: string | null;
  modelo: string | null;
  serial: string | null;
  cto_porta: string | null;
  data_atendimento: string | null;
  hora_atendimento: string | null;
  dados: AnyChecklistData;
  codigo_validacao: string | null;
  numero_publico: string | null;
  revision_number: number;
  is_current: boolean;
  finalizado_em: string | null;
  created_at: string;
  updated_at: string;
  // Novos campos para diferenciar validação de troca efetivamente realizada
  troca_realizada: boolean | null;
  modelo_ont_retirada: string | null;
  serial_ont_retirada: string | null;
  modelo_ont_instalada: string | null;
  serial_ont_instalada: string | null;
  exchange_ticket_code: string | null;
  rmap_code?: string | null;
  intervention_code?: string | null;

  review_status?: "pendente" | "aprovado" | "reprovado" | null;
  review_comment?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  locked_for_rework?: boolean | null;
}

export interface FotoRow {
  id: string;
  checklist_id: string;
  tecnico_id: string;
  categoria:
    | "etiqueta"
    | "leds"
    | "fonte"
    | "teste_cabeado"
    | "teste_wifi"
    | "antes"
    | "depois"
    | "outro";
  storage_path: string;
  legenda: string | null;
  created_at: string;
}

export const FOTO_CATEGORIAS: {
  value: FotoRow["categoria"];
  label: string;
}[] = [
  { value: "etiqueta", label: "Etiqueta (modelo/serial)" },
  { value: "leds", label: "LEDs da ONT" },
  { value: "fonte", label: "Fonte/conexões" },
  { value: "teste_cabeado", label: "Teste cabeado" },
  { value: "teste_wifi", label: "Teste Wi-Fi" },
  { value: "antes", label: "Antes da intervenção" },
  { value: "depois", label: "Depois da intervenção" },
  { value: "outro", label: "Outro" },
];

/** Categorias de evidência usadas em intervenções de rede (CTO, rompimento etc.). */
export const FOTO_CATEGORIAS_REDE: {
  value: FotoRow["categoria"];
  label: string;
}[] = [
  { value: "antes", label: "Antes da intervenção" },
  { value: "depois", label: "Depois da intervenção" },
  { value: "etiqueta", label: "Etiqueta / identificação" },
  { value: "outro", label: "Outro" },
];

export function fotoCategoriaLabel(value: FotoRow["categoria"]): string {
  return FOTO_CATEGORIAS.find((c) => c.value === value)?.label ?? value;
}

export const TIPO_LABEL: Record<TipoChecklist, string> = {
  validacao_ont: "Validação de ONT",
  instalacao: "Instalação",
  remapeamento_cto: "Remapeamento de CTO/NAP",
  rompimento: "Rompimento de fibra",
  readequacao: "Readequação de rede",
  melhoria_sinal: "Melhoria de sinal",
};

/** Prefixo do código sequencial gerado no banco ao finalizar a intervenção. */
export const INTERVENCAO_PREFIX: Record<TipoIntervencao, string> = {
  rompimento: "RPT",
  readequacao: "RDEA",
  melhoria_sinal: "MSIG",
};

export const INTERVENCAO_DESCRICAO: Record<TipoIntervencao, string> = {
  rompimento:
    "Rota do rompimento, fusões executadas, materiais aplicados e laudo OTDR antes/depois.",
  readequacao:
    "Reorganização de rota, troca de cabo ou remanejamento de infraestrutura com evidência cartográfica.",
  melhoria_sinal:
    "Correção de atenuação: potência antes/depois, fusões e comprovação técnica do ganho.",
};


