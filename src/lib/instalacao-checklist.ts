export type InstalacaoAnswer = "sim" | "nao";

export type InstalacaoQuestion = {
  id: string;
  question: string;
};

export const INSTALACAO_TECHNICIAN_QUESTIONS: InstalacaoQuestion[] = [
  { id: "tq01", question: "O atendimento foi realizado no endereço do cliente?" },
  { id: "tq02", question: "Você se identificou antes de iniciar o atendimento?" },
  { id: "tq03", question: "Você explicou ao cliente o que seria feito no atendimento?" },
  { id: "tq04", question: "A ONT / roteador ficou funcionando normalmente após o serviço?" },
  { id: "tq05", question: "Você testou a conexão com a internet após finalizar o atendimento?" },
  { id: "tq06", question: "Foi realizado um teste de velocidade pelo Wi-Fi?" },
  { id: "tq07", question: "O resultado do teste de velocidade foi mostrado ao cliente?" },
  { id: "tq08", question: "Você verificou se a navegação estava funcionando normalmente?" },
  { id: "tq09", question: "A rede Wi-Fi 2,4 GHz foi testada?" },
  { id: "tq10", question: "A rede Wi-Fi 5 GHz foi testada, quando disponível?" },
  { id: "tq11", question: "Você explicou ao cliente a diferença entre as redes 2,4 GHz e 5 GHz?" },
  { id: "tq12", question: "Você explicou que a velocidade no Wi-Fi pode variar de acordo com o aparelho utilizado?" },
  { id: "tq13", question: "Você orientou o cliente que paredes, distância e interferências podem afetar o sinal do Wi-Fi?" },
  { id: "tq14", question: "O posicionamento do roteador foi verificado?" },
  { id: "tq15", question: "Você orientou o cliente sobre qual rede Wi-Fi utilizar em cada situação?" },
  { id: "tq16", question: "Você mostrou ao cliente que a internet estava funcionando antes de encerrar o atendimento?" },
  { id: "tq17", question: "Você explicou ao cliente como utilizar o Downdetector para verificar possíveis falhas gerais antes de acionar o suporte?" },
  { id: "tq18", question: "O local foi deixado limpo e organizado após o atendimento?" },
  { id: "tq19", question: "As dúvidas do cliente foram esclarecidas?" },
  { id: "tq20", question: "O cliente acompanhou a verificação final do serviço?" },
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
