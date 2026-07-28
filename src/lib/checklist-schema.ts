// Shape completo dos dados dinâmicos dos checklists (armazenados em JSONB)

export type YesNo = "sim" | "nao" | null;
export type TipoChecklist = "validacao_ont" | "instalacao" | "remapeamento_cto";

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
export type RemapPortStatus = "ocupada" | "livre" | "nao_identificado";

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
}

export interface RemapFusaoItem {
  fibra: string;
  motivo: string;
  antes_dbm: string;
  depois_dbm: string;
}

export interface RemapeamentoData {
  identificacao: {
    setor: string;
    cto_codigo: string;
  };
  localizacao: {
    gps_original: RemapGpsPoint | null;
    confirmada: { lat: number; lng: number } | null;
    confirmada_em: string | null;
    distancia_m: number | null;
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
    localizacao: { gps_original: null, confirmada: null, confirmada_em: null, distancia_m: null },
    splitter: { tipo: null, tipo_outro: "", potencia_entrada_dbm: "" },
    alimentacao: { cabo: "", tubo: "", fibra: "", cor_fibra: "", origem: "", observacao: "" },
    portas: [],
    fusao: { necessaria: null, itens: [] },
    resultado: { estado: null, pendencia: "" },
  };
}


export function emptyDadosFor(
  tipo: TipoChecklist,
): ChecklistData | InstalacaoData | RemapeamentoData {
  if (tipo === "instalacao") return emptyInstalacaoData();
  if (tipo === "remapeamento_cto") return emptyRemapeamentoData();
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
  dados: ChecklistData | InstalacaoData | RemapeamentoData;
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
  categoria: "etiqueta" | "leds" | "fonte" | "teste_cabeado" | "teste_wifi" | "outro";
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
  { value: "outro", label: "Outro" },
];

export const TIPO_LABEL: Record<TipoChecklist, string> = {
  validacao_ont: "Validação de ONT",
  instalacao: "Instalação",
  remapeamento_cto: "Remapeamento de CTO/NAP",
};

