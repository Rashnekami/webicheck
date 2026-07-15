// Shape completo dos dados dinâmicos do checklist ONT (armazenado como JSONB)
// Corresponde 1:1 ao modelo Webifibra_Checklist_Tecnico_Validacao_ONT

export type YesNo = "sim" | "nao" | null;

export interface ChecklistData {
  sintoma: {
    ont_nao_liga: boolean;
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
  };
  relato: string;
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
    },
    relato: "",
    noc: {
      autorizada: null,
      analista: "",
      data: "",
      hora: "",
      protocolo: "",
    },
  };
}

export type ChecklistStatus = "rascunho" | "finalizado";

export interface ChecklistRow {
  id: string;
  tecnico_id: string;
  status: ChecklistStatus;
  os: string | null;
  cliente: string | null;
  cidade: string | null;
  modelo: string | null;
  serial: string | null;
  cto_porta: string | null;
  data_atendimento: string | null;
  hora_atendimento: string | null;
  dados: ChecklistData;
  codigo_validacao: string | null;
  numero_publico: string | null;
  finalizado_em: string | null;
  created_at: string;
  updated_at: string;
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
  { value: "outro", label: "Outro" },
];
