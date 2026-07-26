export const SMART_DIAGNOSTIC_ENGINE_VERSION = "beta-v2";

export const SMART_DIAGNOSTIC_STORAGE_KEY = "webicheck.smart-diagnostic.beta-v2";

export type DiagnosticStatus =
  | "DIAGNOSTICO_EM_ANDAMENTO"
  | "AGUARDANDO_TESTE"
  | "NORMALIZADO"
  | "TROCA_NAO_INDICADA"
  | "POSSIVEL_DEFEITO_ONT"
  | "DIVERGENCIA"
  | "REVISAO_NOC";

export type SymptomCategory = "ont" | "wifi" | "lan" | "service" | "other";

export type SymptomId =
  | "ont_nao_liga"
  | "ont_reinicia"
  | "ont_trava"
  | "perde_provisionamento"
  | "sem_internet"
  | "internet_intermitente"
  | "pon_instavel"
  | "los_ativo"
  | "sinal_optico"
  | "lentidao"
  | "wifi_desconecta"
  | "wifi_alcance"
  | "wifi_24_desaparece"
  | "wifi_5_desaparece"
  | "wifi_ambas_desaparecem"
  | "alguns_dispositivos"
  | "porta_lan"
  | "negociacao_lan"
  | "equipamento_sem_acesso"
  | "cabo_rede"
  | "aplicativo"
  | "site"
  | "streaming"
  | "iptv"
  | "jogo"
  | "tv"
  | "outro_servico"
  | "outro";

export interface DiagnosticMetadata {
  client: string;
  workOrder: string;
  city: string;
  otherSymptom: string;
  serviceType: "manutencao";
  linkedChecklistCode: string;
  equipmentModel: string;
}

export type DiagnosticAnswer = string | string[] | Record<string, string>;

export interface DiagnosticDecisionEvent {
  id: string;
  questionId: string;
  question: string;
  category: string;
  answer: DiagnosticAnswer;
  answerLabel: string;
  evidence: string | null;
  origin: "technician" | "webi-diagnostic" | "system";
  engineVersion: string;
  createdAt: string;
}

export interface SmartDiagnosticSession {
  id: string;
  engineVersion: string;
  metadata: DiagnosticMetadata;
  symptoms: SymptomId[];
  answers: Record<string, DiagnosticAnswer>;
  history: string[];
  events: DiagnosticDecisionEvent[];
  startedAt: string;
  updatedAt: string;
}

export interface DiagnosticOption {
  value: string;
  label: string;
  description?: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
}

export interface DiagnosticQuestion {
  id: string;
  category: string;
  prompt: string;
  helper?: string;
  type: "single" | "text" | "number" | "metrics" | "optical_metrics";
  options?: DiagnosticOption[];
  evidence?: string;
}

export interface HypothesisView {
  label: string;
  score: number;
  state: "reinforced" | "reduced" | "eliminated";
  reason: string;
}

export interface NocReadiness {
  eligible: boolean;
  profile: "ont_power" | "ont_restart" | "radio_5" | "lan" | null;
  title: string;
  completed: string[];
  missing: string[];
}

export interface DiagnosticEvaluation {
  status: DiagnosticStatus;
  statusLabel: string;
  probableCause: string;
  hypotheses: HypothesisView[];
  validations: string[];
  eliminated: string[];
  recommendations: string[];
  divergences: DiagnosticDivergence[];
  noc: NocReadiness;
}

export interface DiagnosticDivergence {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  requiredAction: string;
}

export interface SymptomDefinition {
  id: SymptomId;
  category: SymptomCategory;
  label: string;
}

export const SYMPTOM_GROUPS: Array<{
  id: SymptomCategory;
  label: string;
  description: string;
  symptoms: SymptomDefinition[];
}> = [
  {
    id: "ont",
    label: "ONT / Conexão",
    description: "Energia, reinicialização, PON, LOS, óptica e provisionamento.",
    symptoms: [
      { id: "ont_nao_liga", category: "ont", label: "ONT não liga" },
      { id: "ont_reinicia", category: "ont", label: "ONT reinicia sozinha" },
      { id: "ont_trava", category: "ont", label: "ONT trava" },
      { id: "perde_provisionamento", category: "ont", label: "Perde provisionamento" },
      { id: "sem_internet", category: "ont", label: "Sem internet" },
      { id: "internet_intermitente", category: "ont", label: "Internet cai/intermitente" },
      { id: "pon_instavel", category: "ont", label: "PON instável" },
      { id: "los_ativo", category: "ont", label: "LOS aceso ou piscando" },
      { id: "sinal_optico", category: "ont", label: "Sinal óptico fora do padrão" },
    ],
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    description: "Desempenho, alcance, desconexão e rádios 2.4/5 GHz.",
    symptoms: [
      { id: "lentidao", category: "wifi", label: "Lentidão" },
      { id: "wifi_desconecta", category: "wifi", label: "Wi-Fi desconecta" },
      { id: "wifi_alcance", category: "wifi", label: "Wi-Fi com pouco alcance" },
      { id: "wifi_24_desaparece", category: "wifi", label: "Rede 2.4 GHz desaparece" },
      { id: "wifi_5_desaparece", category: "wifi", label: "Rede 5 GHz desaparece" },
      { id: "wifi_ambas_desaparecem", category: "wifi", label: "Ambas as redes desaparecem" },
      { id: "alguns_dispositivos", category: "wifi", label: "Problema em alguns aparelhos" },
    ],
  },
  {
    id: "lan",
    label: "Rede cabeada",
    description: "Portas LAN, negociação, equipamentos e cabos.",
    symptoms: [
      { id: "porta_lan", category: "lan", label: "Porta LAN não funciona" },
      { id: "negociacao_lan", category: "lan", label: "Negociação abaixo do esperado" },
      { id: "equipamento_sem_acesso", category: "lan", label: "Equipamento sem acesso" },
      { id: "cabo_rede", category: "lan", label: "Cabo de rede com problema" },
    ],
  },
  {
    id: "service",
    label: "Aplicativo / Serviço",
    description: "Sites, streaming, IPTV, jogos e serviços externos.",
    symptoms: [
      { id: "aplicativo", category: "service", label: "Aplicativo específico" },
      { id: "site", category: "service", label: "Site específico" },
      { id: "streaming", category: "service", label: "Streaming" },
      { id: "iptv", category: "service", label: "IPTV" },
      { id: "jogo", category: "service", label: "Jogo" },
      { id: "tv", category: "service", label: "TV" },
      { id: "outro_servico", category: "service", label: "Outro serviço" },
    ],
  },
  {
    id: "other",
    label: "Outro",
    description: "Sintoma que não se encaixa nas categorias anteriores.",
    symptoms: [{ id: "outro", category: "other", label: "Outro problema" }],
  },
];

const yesNoNa: DiagnosticOption[] = [
  { value: "yes", label: "Sim", tone: "positive" },
  { value: "no", label: "Não", tone: "negative" },
  { value: "na", label: "Não se aplica", tone: "neutral" },
];

const yesNoUnknown: DiagnosticOption[] = [
  { value: "yes", label: "Sim", tone: "positive" },
  { value: "no", label: "Não", tone: "negative" },
  { value: "unknown", label: "Não foi possível confirmar", tone: "warning" },
];

const serviceScopeOptions: DiagnosticOption[] = [
  { value: "yes", label: "Somente neste aplicativo, site ou serviço", tone: "positive" },
  { value: "no", label: "Também acontece em outros serviços", tone: "negative" },
  { value: "unknown", label: "Não foi possível testar outros serviços", tone: "warning" },
];

const otherServicesOptions: DiagnosticOption[] = [
  { value: "yes", label: "Sim, os outros funcionam normalmente", tone: "positive" },
  { value: "no", label: "Não, os outros também apresentam falha", tone: "negative" },
  { value: "unknown", label: "Não foi possível comparar", tone: "warning" },
];

function answer(session: SmartDiagnosticSession, id: string): string | undefined {
  const value = session.answers[id];
  return typeof value === "string" ? value : undefined;
}

function hasAny(session: SmartDiagnosticSession, ids: SymptomId[]): boolean {
  return ids.some((id) => session.symptoms.includes(id));
}

function isWifi(session: SmartDiagnosticSession): boolean {
  return hasAny(session, [
    "lentidao",
    "wifi_desconecta",
    "wifi_alcance",
    "wifi_24_desaparece",
    "wifi_5_desaparece",
    "wifi_ambas_desaparecem",
    "alguns_dispositivos",
  ]);
}

function isService(session: SmartDiagnosticSession): boolean {
  return hasAny(session, [
    "aplicativo",
    "site",
    "streaming",
    "iptv",
    "jogo",
    "tv",
    "outro_servico",
  ]);
}

function isOptical(session: SmartDiagnosticSession): boolean {
  return hasAny(session, [
    "sem_internet",
    "internet_intermitente",
    "pon_instavel",
    "los_ativo",
    "sinal_optico",
    "perde_provisionamento",
    "ont_trava",
    "ont_reinicia",
    "wifi_5_desaparece",
    "wifi_ambas_desaparecem",
  ]);
}

function isLan(session: SmartDiagnosticSession): boolean {
  return hasAny(session, ["porta_lan", "negociacao_lan", "equipamento_sem_acesso", "cabo_rede"]);
}

const CORE_QUESTIONS: Array<
  DiagnosticQuestion & { when: (session: SmartDiagnosticSession) => boolean }
> = [
  {
    id: "ont_powered_now",
    category: "Alimentação",
    prompt: "A ONT está ligada neste momento?",
    helper: "Informe o estado observado, não uma conclusão sobre o equipamento.",
    type: "single",
    options: yesNoNa,
    evidence: "Estado atual da ONT",
    when: (s) => s.symptoms.includes("ont_nao_liga"),
  },
  {
    id: "outlet_has_power",
    category: "Alimentação",
    prompt: "A tomada utilizada pela ONT foi testada e possui energia?",
    helper: "Teste com um equipamento conhecido ou em outra tomada funcional.",
    type: "single",
    options: yesNoUnknown,
    evidence: "Tomada funcional validada",
    when: (s) => answer(s, "ont_powered_now") === "no",
  },
  {
    id: "power_after_outlet",
    category: "Alimentação",
    prompt: "Após utilizar uma tomada funcional, a ONT ligou?",
    type: "single",
    options: yesNoNa,
    evidence: "Resultado após correção da alimentação",
    when: (s) => answer(s, "outlet_has_power") === "no",
  },
  {
    id: "homologated_psu_tested",
    category: "Alimentação",
    prompt: "Foi testada outra fonte homologada e compatível com esta ONT?",
    helper: "A fonte precisa ser compatível em tensão, corrente e conector.",
    type: "single",
    options: yesNoUnknown,
    evidence: "Fonte homologada testada",
    when: (s) =>
      answer(s, "ont_powered_now") === "no" &&
      answer(s, "power_after_outlet") !== "yes" &&
      answer(s, "outlet_has_power") !== "unknown",
  },
  {
    id: "power_after_psu",
    category: "Alimentação",
    prompt: "Com a fonte homologada de teste, a ONT voltou a ligar?",
    type: "single",
    options: yesNoNa,
    evidence: "Resultado do teste com outra fonte",
    when: (s) => answer(s, "homologated_psu_tested") === "yes",
  },
  {
    id: "restart_scope",
    category: "Estabilidade",
    prompt: "Durante a falha, a ONT reinicia completamente ou apenas o Wi-Fi desaparece?",
    type: "single",
    options: [
      { value: "full", label: "ONT reinicia completamente", tone: "negative" },
      { value: "wifi24", label: "Somente 2.4 GHz desaparece", tone: "warning" },
      { value: "wifi5", label: "Somente 5 GHz desaparece", tone: "warning" },
      { value: "both", label: "2.4 e 5 GHz desaparecem", tone: "warning" },
      { value: "unknown", label: "Não foi possível identificar", tone: "neutral" },
    ],
    evidence: "Escopo exato da reinicialização",
    when: (s) => hasAny(s, ["ont_reinicia", "wifi_ambas_desaparecem"]),
  },
  {
    id: "restart_psu_tested",
    category: "Estabilidade",
    prompt: "Outra fonte homologada foi testada durante o diagnóstico?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Fonte descartada como causa da reinicialização",
    when: (s) => answer(s, "restart_scope") === "full",
  },
  {
    id: "restart_outlet_tested",
    category: "Estabilidade",
    prompt: "Outra tomada funcional foi testada?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Tomada descartada como causa da reinicialização",
    when: (s) => answer(s, "restart_psu_tested") === "yes",
  },
  {
    id: "overheating",
    category: "Estabilidade",
    prompt: "A ONT apresenta aquecimento excessivo ou está em local sem ventilação adequada?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Condição de temperatura e ventilação",
    when: (s) => answer(s, "restart_outlet_tested") === "yes",
  },
  {
    id: "failure_after_ventilation",
    category: "Estabilidade",
    prompt: "Após corrigir ventilação ou posicionamento, a falha voltou a ocorrer?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Resultado após correção de ventilação",
    when: (s) => answer(s, "overheating") === "yes",
  },
  {
    id: "los_active",
    category: "Óptica",
    prompt: "O LED LOS está aceso ou piscando?",
    helper: "Com LOS ativo, o diagnóstico óptico tem prioridade sobre velocidade e Wi-Fi.",
    type: "single",
    options: yesNoUnknown,
    evidence: "Estado do LED LOS",
    when: (s) =>
      (isOptical(s) || answer(s, "wifi_network") === "wifi5") &&
      answer(s, "power_after_psu") !== "no",
  },
  {
    id: "optical_in_range",
    category: "Óptica",
    prompt: "O nível óptico está dentro do padrão configurado pelo provedor?",
    helper:
      "Nesta fase Beta, utilize o padrão operacional vigente. Nenhum limite está fixado no código.",
    type: "single",
    options: yesNoUnknown,
    evidence: "Nível óptico confrontado com o padrão do provedor",
    when: (s) =>
      (isOptical(s) || answer(s, "wifi_network") === "wifi5") &&
      answer(s, "los_active") !== undefined,
  },
  {
    id: "optical_measurements_available",
    category: "Óptica",
    prompt: "Os valores RX da ONT ou da OLT estão disponíveis para registrar?",
    helper:
      "Se não estiverem disponíveis, o fluxo continua e a limitação ficará registrada no parecer.",
    type: "single",
    options: [
      { value: "yes", label: "Sim, registrar os valores", tone: "positive" },
      { value: "no", label: "Não estão disponíveis", tone: "neutral" },
    ],
    evidence: "Disponibilidade das medições ópticas",
    when: (s) => answer(s, "optical_in_range") !== undefined,
  },
  {
    id: "optical_metrics",
    category: "Óptica",
    prompt: "Registre os valores ópticos exatamente como foram medidos.",
    helper:
      "Os limites permanecem configuráveis pelo provedor. A IA recebe os valores como evidência, sem inventar parâmetros.",
    type: "optical_metrics",
    evidence: "RX da ONT/OLT e origem da leitura",
    when: (s) => answer(s, "optical_measurements_available") === "yes",
  },
  {
    id: "optical_consistency",
    category: "Óptica",
    prompt:
      "Confirme: neste momento, com o nível óptico dentro do padrão, o LED LOS continua aceso ou piscando?",
    helper:
      "LOS ativo e potência normal são informações divergentes. Confirme o estado atual antes de continuar.",
    type: "single",
    options: yesNoUnknown,
    evidence: "Consistência entre o LED LOS e a leitura óptica atual",
    when: (s) => answer(s, "los_active") === "yes" && answer(s, "optical_in_range") === "yes",
  },
  {
    id: "optical_path_checked",
    category: "Óptica",
    prompt: "Drop, patch cord, conectores e acomodação da fibra foram verificados?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Caminho óptico inspecionado",
    when: (s) =>
      answer(s, "optical_in_range") === "no" ||
      (answer(s, "los_active") === "yes" && answer(s, "optical_consistency") !== "no"),
  },
  {
    id: "optical_fault_found",
    category: "Óptica",
    prompt: "Foi encontrada alguma falha no caminho óptico?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Falha óptica identificada ou descartada",
    when: (s) => answer(s, "optical_path_checked") === "yes",
  },
  {
    id: "optical_after_correction",
    category: "Óptica",
    prompt: "Após a correção, o nível óptico normalizou?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Nível óptico após intervenção",
    when: (s) => answer(s, "optical_fault_found") === "yes",
  },
  {
    id: "connection_after_optical",
    category: "Óptica",
    prompt: "Após a correção óptica, a conexão voltou a funcionar normalmente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Conectividade após correção óptica",
    when: (s) => answer(s, "optical_after_correction") === "yes",
  },
  {
    id: "pon_stable",
    category: "Provisionamento",
    prompt: "O LED PON permanece estável?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Estado do registro PON",
    when: (s) =>
      isOptical(s) &&
      answer(s, "optical_in_range") === "yes" &&
      answer(s, "connection_after_optical") !== "yes",
  },
  {
    id: "provisioned",
    category: "Provisionamento",
    prompt: "A ONT está registrada e provisionada corretamente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Provisionamento validado",
    when: (s) =>
      s.symptoms.includes("perde_provisionamento") ||
      answer(s, "pon_stable") === "no" ||
      answer(s, "pon_stable") === "unknown",
  },
  {
    id: "problem_after_reprovision",
    category: "Provisionamento",
    prompt: "Após o reprovisionamento ou ajuste, o problema continua?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Resultado do reprovisionamento",
    when: (s) => answer(s, "provisioned") === "no",
  },
  {
    id: "all_devices",
    category: "Dispositivos",
    prompt: "O problema acontece em todos os dispositivos do cliente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Comparação entre dispositivos",
    when: (s) =>
      (isWifi(s) || isService(s) || s.symptoms.includes("internet_intermitente")) &&
      answer(s, "connection_after_optical") !== "yes",
  },
  {
    id: "device_count",
    category: "Dispositivos",
    prompt: "Quantos dispositivos apresentam o problema?",
    type: "single",
    options: [
      { value: "one", label: "Apenas um", tone: "warning" },
      { value: "many", label: "Mais de um", tone: "neutral" },
      { value: "all", label: "Todos", tone: "negative" },
      { value: "unknown", label: "Não foi possível confirmar", tone: "neutral" },
    ],
    evidence: "Quantidade de dispositivos afetados",
    when: (s) => answer(s, "all_devices") === "no",
  },
  {
    id: "comparison_device_tested",
    category: "Dispositivos",
    prompt: "Outro dispositivo foi testado no mesmo local e na mesma rede?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Teste comparativo com outro dispositivo",
    when: (s) => answer(s, "device_count") === "one",
  },
  {
    id: "comparison_device_result",
    category: "Dispositivos",
    prompt: "O outro dispositivo funcionou normalmente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Resultado do teste comparativo",
    when: (s) => answer(s, "comparison_device_tested") === "yes",
  },
  {
    id: "wifi_network",
    category: "Wi-Fi",
    prompt: "Qual rede apresenta o problema?",
    type: "single",
    options: [
      { value: "wifi24", label: "Somente 2.4 GHz", tone: "warning" },
      { value: "wifi5", label: "Somente 5 GHz", tone: "warning" },
      { value: "both", label: "Ambas", tone: "negative" },
      { value: "unknown", label: "Não identificado", tone: "neutral" },
    ],
    evidence: "Rádio afetado",
    when: (s) => isWifi(s) && answer(s, "comparison_device_result") !== "yes",
  },
  {
    id: "wifi24_during_5_failure",
    category: "Rádio 5 GHz",
    prompt: "Durante a falha do 5 GHz, a rede 2.4 GHz continua aparecendo normalmente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Isolamento da falha no rádio 5 GHz",
    when: (s) =>
      answer(s, "wifi_network") === "wifi5" ||
      answer(s, "restart_scope") === "wifi5" ||
      s.symptoms.includes("wifi_5_desaparece"),
  },
  {
    id: "wifi5_after_adjustment",
    category: "Rádio 5 GHz",
    prompt: "A rede 5 GHz voltou após reiniciar, ajustar ou reprovisionar a ONT?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Resultado do ajuste do rádio 5 GHz",
    when: (s) => answer(s, "wifi24_during_5_failure") === "yes",
  },
  {
    id: "wifi5_recurrent",
    category: "Rádio 5 GHz",
    prompt: "Esse desaparecimento do 5 GHz já aconteceu anteriormente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Histórico de recorrência do rádio 5 GHz",
    when: (s) => answer(s, "wifi5_after_adjustment") !== undefined,
  },
  {
    id: "wifi5_recurred_confirmed",
    category: "Rádio 5 GHz",
    prompt: "A falha voltou durante o atendimento ou existe histórico confirmado da recorrência?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Recorrência confirmada",
    when: (s) => answer(s, "wifi5_recurrent") === "yes",
  },
  {
    id: "wifi_power_stable",
    category: "Rádio 5 GHz",
    prompt: "A alimentação da ONT está estável, com fonte e tomada validadas?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Alimentação descartada no diagnóstico do rádio",
    when: (s) => answer(s, "wifi5_recurred_confirmed") === "yes",
  },
  {
    id: "near_ont_works",
    category: "Cobertura Wi-Fi",
    prompt: "Próximo da ONT, o dispositivo funciona normalmente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Teste próximo da ONT",
    when: (s) =>
      s.symptoms.includes("wifi_alcance") ||
      (s.symptoms.includes("lentidao") && answer(s, "wifi_network") !== "unknown"),
  },
  {
    id: "distant_only",
    category: "Cobertura Wi-Fi",
    prompt: "O problema acontece principalmente nos locais mais distantes da ONT?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Relação entre distância e falha",
    when: (s) => answer(s, "near_ont_works") === "yes",
  },
  {
    id: "ont_position_ok",
    category: "Cobertura Wi-Fi",
    prompt: "A ONT está posicionada em local adequado e livre de obstáculos excessivos?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Posicionamento da ONT",
    when: (s) => answer(s, "distant_only") === "yes",
  },
  {
    id: "slowness_many_services",
    category: "Desempenho",
    prompt: "A lentidão acontece em vários aplicativos e serviços?",
    type: "single",
    options: [
      { value: "yes", label: "Sim, em vários aplicativos e serviços", tone: "positive" },
      { value: "no", label: "Não, somente em um aplicativo ou serviço", tone: "negative" },
      { value: "unknown", label: "Não foi possível comparar", tone: "warning" },
    ],
    evidence: "Abrangência da lentidão",
    when: (s) => s.symptoms.includes("lentidao"),
  },
  {
    id: "specific_service_only",
    category: "Serviço",
    prompt: "A falha acontece somente em um aplicativo, site, jogo ou serviço?",
    helper: "Compare o serviço afetado com outros aplicativos e sites antes de responder.",
    type: "single",
    options: serviceScopeOptions,
    evidence: "Falha isolada em serviço",
    when: (s) => answer(s, "slowness_many_services") === "no" || isService(s),
  },
  {
    id: "other_services_normal",
    category: "Serviço",
    prompt: "Outros aplicativos e sites funcionam normalmente?",
    helper: "Use esta confirmação para separar falha de internet de indisponibilidade do serviço.",
    type: "single",
    options: otherServicesOptions,
    evidence: "Comparação com outros serviços",
    when: (s) => answer(s, "specific_service_only") === "yes" || isService(s),
  },
  {
    id: "downdetector",
    category: "Serviço",
    prompt: "Existe indicação de indisponibilidade ou instabilidade no Downdetector?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Consulta de indisponibilidade externa",
    when: (s) => answer(s, "other_services_normal") === "yes",
  },
  {
    id: "performance_test",
    category: "Desempenho",
    prompt: "Foi possível realizar teste de desempenho?",
    helper: "O teste cabeado não é obrigatório. Registre a conexão realmente utilizada.",
    type: "single",
    options: yesNoNa,
    evidence: "Disponibilidade do teste de desempenho",
    when: (s) =>
      (s.symptoms.includes("lentidao") ||
        s.symptoms.includes("internet_intermitente") ||
        s.symptoms.includes("negociacao_lan")) &&
      answer(s, "downdetector") !== "yes",
  },
  {
    id: "performance_metrics",
    category: "Desempenho",
    prompt: "Registre os dados disponíveis do teste.",
    helper: "Jitter é opcional. Informe exatamente o dispositivo e a conexão utilizados.",
    type: "metrics",
    evidence: "Métricas do teste de desempenho",
    when: (s) => answer(s, "performance_test") === "yes",
  },
  {
    id: "device_capacity",
    category: "Desempenho",
    prompt: "O dispositivo utilizado possui capacidade compatível com a velocidade contratada?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Capacidade do dispositivo de teste",
    when: (s) => s.answers.performance_metrics !== undefined,
  },
  {
    id: "other_lan_port",
    category: "Rede cabeada",
    prompt: "Outra porta LAN da ONT foi testada?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Comparação entre portas LAN",
    when: (s) => isLan(s),
  },
  {
    id: "other_lan_port_result",
    category: "Rede cabeada",
    prompt: "A outra porta LAN funcionou normalmente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Resultado da outra porta LAN",
    when: (s) => answer(s, "other_lan_port") === "yes",
  },
  {
    id: "other_ethernet_cable",
    category: "Rede cabeada",
    prompt: "Outro cabo de rede foi testado?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Cabo Ethernet descartado",
    when: (s) => isLan(s),
  },
  {
    id: "other_lan_device",
    category: "Rede cabeada",
    prompt: "Outro equipamento foi conectado utilizando o cabo e a porta em teste?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Dispositivo original descartado",
    when: (s) => answer(s, "other_ethernet_cable") === "yes",
  },
  {
    id: "other_lan_device_result",
    category: "Rede cabeada",
    prompt: "O outro equipamento conseguiu negociar e acessar normalmente?",
    type: "single",
    options: yesNoUnknown,
    evidence: "Resultado com outro equipamento",
    when: (s) => answer(s, "other_lan_device") === "yes",
  },
  {
    id: "other_description",
    category: "Sintoma",
    prompt: "Descreva resumidamente o comportamento observado.",
    helper: "Registre fatos: quando ocorre, o que deixa de funcionar e o que permanece normal.",
    type: "text",
    evidence: "Descrição objetiva do sintoma",
    when: (s) => s.symptoms.includes("outro"),
  },
];

function getApplicableActions(session: SmartDiagnosticSession): DiagnosticOption[] {
  const actions: DiagnosticOption[] = [];
  const add = (value: string, label: string) => {
    if (!actions.some((item) => item.value === value)) {
      actions.push({ value, label, tone: "neutral" });
    }
  };

  if (
    answer(session, "outlet_has_power") === "no" ||
    answer(session, "power_after_outlet") !== undefined
  ) {
    add("outlet_fixed", "Tomada/alimentação corrigida");
  }
  if (
    answer(session, "homologated_psu_tested") !== undefined ||
    answer(session, "restart_psu_tested") !== undefined
  ) {
    add("psu_replaced", "Fonte homologada substituída/testada");
  }
  if (answer(session, "optical_path_checked") === "yes") {
    add("connector_redone", "Conector óptico refeito");
    add("patch_cord_replaced", "Patch cord substituído");
    add("drop_fixed", "Drop corrigido");
    add("fiber_reorganized", "Fibra reorganizada");
  }
  if (answer(session, "overheating") === "yes" || answer(session, "ont_position_ok") === "no") {
    add("ont_repositioned", "ONT reposicionada / ventilação corrigida");
  }
  if (isWifi(session)) {
    add("wifi_channel", "Canal Wi-Fi alterado");
    add("wifi_settings", "Configuração Wi-Fi ajustada");
    if (
      answer(session, "wifi_network") === "wifi5" ||
      session.symptoms.includes("wifi_5_desaparece")
    ) {
      add("wifi5_adjusted", "Rede 5 GHz ajustada / reprovisionada");
    }
    if (
      answer(session, "wifi_network") === "wifi24" ||
      session.symptoms.includes("wifi_24_desaparece")
    ) {
      add("wifi24_adjusted", "Rede 2.4 GHz ajustada");
    }
  }
  if (answer(session, "provisioned") === "no") {
    add("reprovisioned", "Reprovisionamento realizado");
  }
  if (isLan(session)) {
    add("lan_settings", "Configuração LAN corrigida");
    add("cable_replaced", "Cabo de rede substituído");
  }
  if (answer(session, "comparison_device_result") === "yes") {
    add("client_device", "Equipamento do cliente identificado como causa");
  }
  if (answer(session, "downdetector") === "yes") {
    add("external_service", "Serviço externo identificado");
  }
  add("customer_guidance", "Orientação realizada ao cliente");
  add("no_action_solved", "Nenhuma ação resolveu");
  add("other_action", "Outra ação realizada");
  return actions;
}

export function createSmartDiagnosticSession(): SmartDiagnosticSession {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    engineVersion: SMART_DIAGNOSTIC_ENGINE_VERSION,
    metadata: {
      client: "",
      workOrder: "",
      city: "",
      otherSymptom: "",
      serviceType: "manutencao",
      linkedChecklistCode: "",
      equipmentModel: "",
    },
    symptoms: [],
    answers: {},
    history: [],
    events: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function getNextDiagnosticQuestion(
  session: SmartDiagnosticSession,
): DiagnosticQuestion | null {
  for (const question of CORE_QUESTIONS) {
    if (question.when(session) && session.answers[question.id] === undefined) {
      const { when: _when, ...view } = question;
      return view;
    }
  }

  if (session.answers.corrective_action === undefined) {
    return {
      id: "corrective_action",
      category: "Ação corretiva",
      prompt: "Qual ação foi realizada neste atendimento?",
      helper: "O sistema mostra apenas ações compatíveis com o caminho percorrido.",
      type: "single",
      options: getApplicableActions(session),
      evidence: "Ação efetivamente realizada",
    };
  }

  if (answer(session, "retest_performed") !== "yes") {
    const waitingForRetest = answer(session, "retest_performed") === "no";
    return {
      id: "retest_performed",
      category: "Reteste obrigatório",
      prompt: waitingForRetest
        ? "Realize o reteste do sintoma original para continuar."
        : "Após a intervenção, o problema foi novamente testado?",
      helper: waitingForRetest
        ? "Quando terminar o teste, toque no botão abaixo. Suas respostas permanecem salvas."
        : "Confirme o reteste do sintoma original.",
      type: "single",
      options: waitingForRetest
        ? [{ value: "yes", label: "Reteste realizado — continuar", tone: "positive" }]
        : [
            { value: "yes", label: "Sim, o reteste foi realizado", tone: "positive" },
            { value: "no", label: "Ainda não realizei o reteste", tone: "warning" },
          ],
      evidence: "Reteste após a intervenção",
    };
  }

  if (session.answers.symptom_persists === undefined) {
    return {
      id: "symptom_persists",
      category: "Resultado",
      prompt: "O sintoma original continua acontecendo?",
      type: "single",
      options: [
        { value: "yes", label: "Sim, continua", tone: "negative" },
        { value: "no", label: "Não, foi normalizado", tone: "positive" },
        { value: "unknown", label: "Não foi possível confirmar", tone: "warning" },
      ],
      evidence: "Resultado do reteste",
    };
  }

  return null;
}

function pushHypothesis(
  target: HypothesisView[],
  label: string,
  score: number,
  state: HypothesisView["state"],
  reason: string,
) {
  const current = target.find((item) => item.label === label);
  if (!current || score > current.score || state === "eliminated") {
    if (current) target.splice(target.indexOf(current), 1);
    target.push({ label, score, state, reason });
  }
}

function buildNocReadiness(session: SmartDiagnosticSession): NocReadiness {
  const persisted =
    answer(session, "retest_performed") === "yes" && answer(session, "symptom_persists") === "yes";

  const profiles: Array<{
    profile: Exclude<NocReadiness["profile"], null>;
    active: boolean;
    title: string;
    checks: Array<[boolean, string]>;
  }> = [
    {
      profile: "ont_power",
      active: session.symptoms.includes("ont_nao_liga"),
      title: "Possível falha física de alimentação da ONT",
      checks: [
        [answer(session, "outlet_has_power") === "yes", "Tomada funcional validada"],
        [answer(session, "homologated_psu_tested") === "yes", "Fonte homologada testada"],
        [answer(session, "power_after_psu") === "no", "ONT permaneceu desligada com outra fonte"],
        [answer(session, "retest_performed") === "yes", "Reteste realizado"],
        [answer(session, "symptom_persists") === "yes", "Sintoma permanece"],
      ],
    },
    {
      profile: "ont_restart",
      active: answer(session, "restart_scope") === "full",
      title: "Possível falha recorrente de hardware da ONT",
      checks: [
        [answer(session, "restart_psu_tested") === "yes", "Fonte homologada validada"],
        [answer(session, "restart_outlet_tested") === "yes", "Tomada funcional validada"],
        [
          answer(session, "overheating") === "no" ||
            answer(session, "failure_after_ventilation") === "yes",
          "Temperatura e ventilação validadas",
        ],
        [answer(session, "optical_in_range") === "yes", "Óptica dentro do padrão"],
        [persisted, "Reteste realizado e falha persistente"],
      ],
    },
    {
      profile: "radio_5",
      active:
        session.symptoms.includes("wifi_5_desaparece") ||
        answer(session, "wifi_network") === "wifi5" ||
        answer(session, "restart_scope") === "wifi5",
      title: "Possível falha recorrente do rádio 5 GHz",
      checks: [
        [answer(session, "wifi24_during_5_failure") === "yes", "2.4 GHz permanece ativo"],
        [
          answer(session, "all_devices") === "yes" ||
            answer(session, "device_count") === "many" ||
            answer(session, "device_count") === "all",
          "Falha confirmada em vários dispositivos",
        ],
        [answer(session, "wifi5_recurrent") === "yes", "Histórico de recorrência registrado"],
        [answer(session, "wifi5_recurred_confirmed") === "yes", "Recorrência confirmada"],
        [answer(session, "wifi_power_stable") === "yes", "Alimentação validada"],
        [answer(session, "optical_in_range") === "yes", "Óptica dentro do padrão"],
        [persisted, "Ajuste/reteste realizado e falha persistente"],
      ],
    },
    {
      profile: "lan",
      active: session.symptoms.includes("porta_lan") || session.symptoms.includes("negociacao_lan"),
      title: "Possível falha física de porta LAN",
      checks: [
        [answer(session, "other_ethernet_cable") === "yes", "Outro cabo testado"],
        [answer(session, "other_lan_device") === "yes", "Outro equipamento testado"],
        [
          answer(session, "other_lan_device_result") === "no",
          "Falha repetida em outro equipamento",
        ],
        [persisted, "Reteste realizado e falha persistente"],
      ],
    },
  ];

  const candidates = profiles
    .filter((item) => item.active)
    .map((item) => ({
      ...item,
      completed: item.checks.filter(([ok]) => ok).map(([, label]) => label),
      missing: item.checks.filter(([ok]) => !ok).map(([, label]) => label),
    }))
    .sort((a, b) => a.missing.length - b.missing.length);

  const selected = candidates[0];
  if (!selected) {
    return {
      eligible: false,
      profile: null,
      title: "Troca de ONT não indicada pelo caminho atual",
      completed: [],
      missing: ["Não há evidências compatíveis com defeito físico da ONT."],
    };
  }

  return {
    eligible: selected.missing.length === 0,
    profile: selected.profile,
    title: selected.title,
    completed: selected.completed,
    missing: selected.missing,
  };
}

export function getDeterministicDivergences(
  session: SmartDiagnosticSession,
): DiagnosticDivergence[] {
  const divergences: DiagnosticDivergence[] = [];
  const add = (item: DiagnosticDivergence) => {
    if (!divergences.some((current) => current.code === item.code)) divergences.push(item);
  };

  if (
    answer(session, "los_active") === "yes" &&
    answer(session, "optical_in_range") === "yes" &&
    answer(session, "optical_consistency") === undefined
  ) {
    add({
      code: "OPTICAL_STATE_UNCONFIRMED",
      severity: "warning",
      title: "Estado óptico precisa de confirmação",
      description:
        "LOS ativo e nível óptico declarado dentro do padrão foram registrados ao mesmo tempo.",
      requiredAction: "Confirmar novamente o LED LOS e a origem da leitura óptica atual.",
    });
  }

  if (
    answer(session, "problem_after_reprovision") === "no" &&
    answer(session, "symptom_persists") === "yes"
  ) {
    add({
      code: "REPROVISION_RESULT_CONFLICT",
      severity: "critical",
      title: "Resultado do reprovisionamento está divergente",
      description:
        "O problema foi marcado como resolvido após o reprovisionamento, mas o reteste final informa que o sintoma persiste.",
      requiredAction: "Revisar uma das respostas e repetir o reteste, se necessário.",
    });
  }

  if (
    answer(session, "connection_after_optical") === "yes" &&
    answer(session, "symptom_persists") === "yes"
  ) {
    add({
      code: "OPTICAL_RESULT_CONFLICT",
      severity: "critical",
      title: "Normalização óptica e reteste final divergem",
      description:
        "A conexão foi registrada como normal após a correção óptica, mas o sintoma original permanece no reteste.",
      requiredAction: "Confirmar qual sintoma permaneceu e atualizar a evidência do teste final.",
    });
  }

  if (
    answer(session, "corrective_action") === "external_service" &&
    answer(session, "downdetector") !== "yes"
  ) {
    add({
      code: "EXTERNAL_SERVICE_WITHOUT_EVIDENCE",
      severity: "warning",
      title: "Serviço externo sem evidência correspondente",
      description:
        "A ação informa serviço externo, mas não existe confirmação de indisponibilidade registrada.",
      requiredAction:
        "Registrar a fonte da indisponibilidade ou escolher a ação efetivamente realizada.",
    });
  }

  if (
    answer(session, "corrective_action") === "client_device" &&
    answer(session, "comparison_device_result") !== "yes"
  ) {
    add({
      code: "CLIENT_DEVICE_WITHOUT_COMPARISON",
      severity: "warning",
      title: "Dispositivo do cliente não foi isolado por comparação",
      description:
        "A causa foi atribuída ao dispositivo, mas outro equipamento não foi registrado como funcionando normalmente.",
      requiredAction: "Realizar o teste comparativo ou revisar a ação selecionada.",
    });
  }

  return divergences;
}

export function evaluateSmartDiagnostic(session: SmartDiagnosticSession): DiagnosticEvaluation {
  const hypotheses: HypothesisView[] = [];
  const validations: string[] = [];
  const eliminated: string[] = [];
  const recommendations: string[] = [];
  const validate = (condition: boolean, label: string) => condition && validations.push(label);
  const eliminate = (condition: boolean, label: string) => condition && eliminated.push(label);

  if (answer(session, "outlet_has_power") === "no") {
    pushHypothesis(hypotheses, "Tomada / alimentação", 90, "reinforced", "Tomada sem energia.");
  }
  if (answer(session, "power_after_outlet") === "yes") {
    pushHypothesis(
      hypotheses,
      "Tomada / alimentação",
      100,
      "reinforced",
      "A ONT voltou a ligar em tomada funcional.",
    );
    eliminate(true, "Defeito físico da ONT");
  }
  if (answer(session, "power_after_psu") === "yes") {
    pushHypothesis(
      hypotheses,
      "Fonte",
      100,
      "reinforced",
      "A ONT voltou a ligar com outra fonte homologada.",
    );
    eliminate(true, "Defeito físico da ONT");
  }
  if (answer(session, "power_after_psu") === "no") {
    pushHypothesis(
      hypotheses,
      "Hardware da ONT",
      95,
      "reinforced",
      "Tomada e fonte foram descartadas, mas a ONT permaneceu desligada.",
    );
  }
  validate(answer(session, "outlet_has_power") === "yes", "Tomada funcional validada");
  validate(
    answer(session, "homologated_psu_tested") === "yes" ||
      answer(session, "restart_psu_tested") === "yes",
    "Fonte homologada validada",
  );

  if (answer(session, "overheating") === "yes") {
    pushHypothesis(
      hypotheses,
      "Temperatura / posicionamento",
      80,
      "reinforced",
      "Aquecimento ou ventilação inadequada identificados.",
    );
  }
  if (answer(session, "failure_after_ventilation") === "no") {
    pushHypothesis(
      hypotheses,
      "Temperatura / posicionamento",
      100,
      "reinforced",
      "Falha cessou após correção de ventilação.",
    );
    eliminate(true, "Falha recorrente da ONT");
  }
  if (
    answer(session, "restart_psu_tested") === "yes" &&
    answer(session, "restart_outlet_tested") === "yes" &&
    (answer(session, "overheating") === "no" ||
      answer(session, "failure_after_ventilation") === "yes")
  ) {
    pushHypothesis(
      hypotheses,
      "Hardware da ONT",
      82,
      "reinforced",
      "Fonte, tomada e condição térmica foram validadas.",
    );
  }

  const opticalInRange = answer(session, "optical_in_range");
  const losActive = answer(session, "los_active");
  const opticalConsistency = answer(session, "optical_consistency");

  if (opticalInRange === "no") {
    pushHypothesis(hypotheses, "Rede óptica", 96, "reinforced", "Potência óptica fora do padrão.");
    recommendations.push("Priorizar correção do caminho óptico antes de avaliar a ONT.");
  }
  if (losActive === "yes" && opticalInRange !== "no" && opticalConsistency !== "no") {
    pushHypothesis(
      hypotheses,
      "Estado óptico precisa de confirmação",
      opticalConsistency === "yes" ? 72 : 55,
      "reduced",
      opticalConsistency === "yes"
        ? "O LOS permanece ativo apesar da leitura normal; confirme a medição e o registro GPON."
        : "LOS foi informado, mas a potência atual está normal. Confirme se o LED ainda permanece ativo.",
    );
    recommendations.push(
      "Confirmar se o LOS é atual ou histórico e repetir a leitura óptica antes de concluir.",
    );
  }
  if (opticalInRange === "yes") {
    validate(true, "Óptica dentro do padrão");
    if (losActive !== "yes" || opticalConsistency === "no") {
      eliminate(true, "Falha óptica atual");
    }
  }
  if (opticalConsistency === "no") {
    validate(true, "LOS não permanece ativo após nova conferência");
  }
  if (answer(session, "connection_after_optical") === "yes") {
    pushHypothesis(
      hypotheses,
      "Rede óptica",
      100,
      "reinforced",
      "A conexão normalizou após a correção óptica.",
    );
    eliminate(true, "Defeito da ONT");
  }

  if (answer(session, "provisioned") === "no") {
    pushHypothesis(
      hypotheses,
      "Provisionamento / configuração",
      90,
      "reinforced",
      "ONT não estava provisionada corretamente.",
    );
  }
  if (answer(session, "problem_after_reprovision") === "no") {
    pushHypothesis(
      hypotheses,
      "Provisionamento / configuração",
      100,
      "reinforced",
      "Problema normalizou após ajuste de provisionamento.",
    );
    eliminate(true, "Defeito físico da ONT");
  }
  validate(answer(session, "pon_stable") === "yes", "PON estável");
  validate(answer(session, "provisioned") === "yes", "Provisionamento validado");

  if (answer(session, "comparison_device_result") === "yes") {
    pushHypothesis(
      hypotheses,
      "Dispositivo / compatibilidade",
      100,
      "reinforced",
      "Outro dispositivo funcionou normalmente no mesmo local e rede.",
    );
    eliminate(true, "Falha geral da ONT");
  }
  validate(
    answer(session, "all_devices") === "yes" ||
      answer(session, "device_count") === "many" ||
      answer(session, "device_count") === "all",
    "Falha comparada em vários dispositivos",
  );

  if (
    answer(session, "wifi24_during_5_failure") === "yes" &&
    answer(session, "wifi5_recurrent") === "yes"
  ) {
    pushHypothesis(
      hypotheses,
      "Rádio 5 GHz / firmware",
      answer(session, "wifi5_recurred_confirmed") === "yes" ? 95 : 78,
      "reinforced",
      "A falha está isolada no 5 GHz e possui recorrência.",
    );
  }
  if (answer(session, "distant_only") === "yes") {
    pushHypothesis(
      hypotheses,
      "Cobertura / interferência",
      96,
      "reinforced",
      "O serviço funciona próximo da ONT e falha nos pontos distantes.",
    );
    eliminate(true, "Defeito físico da ONT");
  }

  if (answer(session, "downdetector") === "yes") {
    pushHypothesis(
      hypotheses,
      "Serviço externo",
      100,
      "reinforced",
      "Há indicação externa de indisponibilidade.",
    );
    eliminate(true, "Defeito da ONT");
  }

  if (answer(session, "device_capacity") === "no") {
    pushHypothesis(
      hypotheses,
      "Limitação do dispositivo",
      90,
      "reinforced",
      "Dispositivo sem capacidade compatível com o plano.",
    );
    recommendations.push("Não utilizar o teste isoladamente para condenar a ONT.");
  }

  if (
    answer(session, "other_ethernet_cable") === "yes" &&
    answer(session, "other_lan_device_result") === "no"
  ) {
    pushHypothesis(
      hypotheses,
      "Porta LAN / hardware",
      92,
      "reinforced",
      "Cabo e dispositivo foram substituídos, mas a falha permaneceu.",
    );
  }
  if (answer(session, "other_lan_device_result") === "yes") {
    pushHypothesis(
      hypotheses,
      "Dispositivo original",
      100,
      "reinforced",
      "Outro equipamento funcionou na mesma conexão.",
    );
    eliminate(true, "Falha da porta LAN");
  }

  validate(answer(session, "retest_performed") === "yes", "Reteste realizado");
  validate(answer(session, "symptom_persists") === "yes", "Sintoma permanece após intervenção");
  validate(answer(session, "symptom_persists") === "no", "Sintoma normalizado no reteste");

  const noc = buildNocReadiness(session);
  const divergences = getDeterministicDivergences(session);
  const next = getNextDiagnosticQuestion(session);
  let status: DiagnosticStatus = "DIAGNOSTICO_EM_ANDAMENTO";
  let statusLabel = "Diagnóstico em andamento";

  if (divergences.some((item) => item.severity === "critical")) {
    status = "DIVERGENCIA";
    statusLabel = "Divergência técnica — revisão necessária";
  } else if (answer(session, "retest_performed") === "no") {
    status = "AGUARDANDO_TESTE";
    statusLabel = "Aguardando reteste obrigatório";
  } else if (answer(session, "symptom_persists") === "no") {
    status = "NORMALIZADO";
    statusLabel = "Atendimento normalizado — ONT mantida";
  } else if (!next && noc.eligible) {
    status = "POSSIVEL_DEFEITO_ONT";
    statusLabel = "Possível defeito da ONT — validações concluídas";
  } else if (!next && answer(session, "symptom_persists") !== undefined) {
    status = "TROCA_NAO_INDICADA";
    statusLabel = "Troca de ONT não indicada pelas evidências";
  }

  if (hypotheses.length === 0) {
    pushHypothesis(
      hypotheses,
      "Necessária análise adicional",
      50,
      "reduced",
      "Ainda não há evidências suficientes para uma causa específica.",
    );
  }

  hypotheses.sort((a, b) => b.score - a.score);
  const probableCause = hypotheses[0]?.label ?? "Necessária análise adicional";

  return {
    status,
    statusLabel,
    probableCause,
    hypotheses,
    validations: [...new Set(validations)],
    eliminated: [...new Set(eliminated)],
    recommendations: [...new Set(recommendations)],
    divergences,
    noc,
  };
}

export function getDiagnosticProgress(session: SmartDiagnosticSession): number {
  if (getNextDiagnosticQuestion(session) === null) return 100;
  const answered = Object.keys(session.answers).length;
  return Math.min(94, 12 + answered * 6);
}

export function getAnswerLabel(question: DiagnosticQuestion, value: DiagnosticAnswer): string {
  if (typeof value === "string") {
    return question.options?.find((option) => option.value === value)?.label ?? value;
  }
  if (Array.isArray(value)) return value.join(", ");
  return Object.entries(value)
    .filter(([, item]) => item)
    .map(([key, item]) => `${key}: ${item}`)
    .join(" · ");
}

export function createDiagnosticDecisionEvent(
  question: DiagnosticQuestion,
  value: DiagnosticAnswer,
  origin: DiagnosticDecisionEvent["origin"] = "technician",
): DiagnosticDecisionEvent {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    questionId: question.id,
    question: question.prompt,
    category: question.category,
    answer: value,
    answerLabel: getAnswerLabel(question, value),
    evidence: question.evidence ?? null,
    origin,
    engineVersion: SMART_DIAGNOSTIC_ENGINE_VERSION,
    createdAt: now,
  };
}

export function getDiagnosticDecisionTrail(
  session: SmartDiagnosticSession,
): DiagnosticDecisionEvent[] {
  return [...session.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildNocWhatsAppPreview(
  session: SmartDiagnosticSession,
  evaluation: DiagnosticEvaluation,
  technician: string,
): string {
  const symptomLabels = SYMPTOM_GROUPS.flatMap((group) => group.symptoms)
    .filter((item) => session.symptoms.includes(item.id))
    .map((item) => item.label);
  const action = answer(session, "corrective_action") ?? "Não informada";

  return [
    "BETA — SIMULAÇÃO, NÃO É UMA AUTORIZAÇÃO REAL",
    "",
    "Olá, NOC.",
    "",
    "Solicito análise para possível troca de ONT.",
    "",
    `OS: ${session.metadata.workOrder || "—"}`,
    "Checklist: Diagnóstico Inteligente Beta",
    `Cliente: ${session.metadata.client || "—"}`,
    `Cidade: ${session.metadata.city || "—"}`,
    `Técnico: ${technician || "—"}`,
    "",
    "SINTOMA:",
    symptomLabels.join(", ") || session.metadata.otherSymptom || "—",
    "",
    "VALIDAÇÕES REALIZADAS:",
    evaluation.validations.join("; ") || "—",
    "",
    "HIPÓTESES DESCARTADAS:",
    evaluation.eliminated.join("; ") || "—",
    "",
    "AÇÃO REALIZADA:",
    action,
    "",
    "RESULTADO DO RETESTE:",
    answer(session, "symptom_persists") === "yes"
      ? "O sintoma permanece."
      : answer(session, "symptom_persists") === "no"
        ? "O sintoma foi normalizado."
        : "Não concluído.",
    "",
    "DIAGNÓSTICO WEBICHECK:",
    evaluation.probableCause,
    "",
    "O problema permanece após as verificações aplicáveis.",
    "",
    "Solicito autorização para troca da ONT.",
  ].join("\n");
}
