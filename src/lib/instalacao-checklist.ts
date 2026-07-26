export type InstalacaoAnswer = "sim" | "nao";

export type InstalacaoQuestion = {
  id: string;
  question: string;
};

export const INSTALACAO_TECHNICIAN_QUESTIONS: InstalacaoQuestion[] = [
  { id: "tq01", question: "O atendimento foi realizado presencialmente no endereço do cliente?" },
  { id: "tq02", question: "Você se identificou ao cliente antes de iniciar o atendimento?" },
  { id: "tq03", question: "Você explicou ao cliente qual serviço seria realizado?" },
  { id: "tq04", question: "A ONT / roteador está funcionando corretamente após o atendimento?" },
  { id: "tq05", question: "A conexão com a internet foi testada após a conclusão do serviço?" },
  { id: "tq06", question: "Foi realizado teste de velocidade utilizando um dispositivo conectado via cabo ou Wi-Fi?" },
  { id: "tq07", question: "O resultado do teste de velocidade foi apresentado ao cliente?" },
  { id: "tq08", question: "A navegação e a estabilidade da conexão foram validadas?" },
  { id: "tq09", question: "A rede Wi-Fi 2,4 GHz foi testada e validada?" },
  { id: "tq10", question: "A rede Wi-Fi 5 GHz foi testada e validada, quando disponível?" },
  { id: "tq11", question: "O cliente foi orientado sobre a diferença entre as redes 2,4 GHz e 5 GHz?" },
  { id: "tq12", question: "O cliente foi orientado de que a velocidade no Wi-Fi depende também da capacidade do aparelho utilizado?" },
  { id: "tq13", question: "O cliente foi orientado sobre o impacto de distância, paredes e interferências no sinal Wi-Fi?" },
  { id: "tq14", question: "O posicionamento do roteador foi verificado e orientado ao cliente?" },
  { id: "tq15", question: "O cliente foi orientado sobre quando utilizar 2,4 GHz e quando utilizar 5 GHz?" },
  { id: "tq16", question: "Foi demonstrado ao cliente que a internet estava funcionando antes do encerramento do atendimento?" },
  { id: "tq17", question: "O cliente foi orientado sobre como identificar possíveis indisponibilidades gerais antes de acionar o suporte?" },
  { id: "tq18", question: "O ambiente foi deixado limpo e organizado após o atendimento?" },
  { id: "tq19", question: "Todas as dúvidas apresentadas pelo cliente foram esclarecidas?" },
  { id: "tq20", question: "O cliente acompanhou a validação final e confirmou o funcionamento do serviço?" },
];

export function readInstalacaoAnswer(
  respostas: Record<string, unknown> | null | undefined,
  id: string,
): InstalacaoAnswer | null {
  const v = respostas?.[id];
  if (v === "sim" || v === "nao") return v;
  return null;
}

export function isInstalacaoComplete(
  respostas: Record<string, unknown> | null | undefined,
): boolean {
  return INSTALACAO_TECHNICIAN_QUESTIONS.every((q) => readInstalacaoAnswer(respostas, q.id) !== null);
}
