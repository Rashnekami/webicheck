export const CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION = "3.0.0";

export type CustomerCounterproofAnswer = "sim" | "nao";

export type CustomerCounterproofQuestion = {
  id: string;
  question: string;
};

export type CustomerCounterproofChecklistItem = {
  id: string;
  question: string;
  answer: CustomerCounterproofAnswer;
};

export type CustomerCounterproofChecklist = {
  version: string;
  items: CustomerCounterproofChecklistItem[];
};

export const CUSTOMER_COUNTERPROOF_QUESTIONS: CustomerCounterproofQuestion[] = [
  { id: "cq01", question: "O atendimento técnico foi realizado no seu endereço?" },
  { id: "cq02", question: "O técnico se identificou antes de iniciar o atendimento?" },
  { id: "cq03", question: "O técnico explicou o que seria realizado?" },
  { id: "cq04", question: "O técnico explicou o serviço executado ao finalizar o atendimento?" },
  { id: "cq05", question: "A sua internet estava funcionando quando o técnico terminou o atendimento?" },
  { id: "cq06", question: "O técnico realizou testes na sua conexão após concluir o serviço?" },
  { id: "cq07", question: "O técnico realizou um teste de velocidade da internet?" },
  { id: "cq08", question: "O resultado do teste foi mostrado para você?" },
  { id: "cq09", question: "Você conseguiu utilizar a internet normalmente após o atendimento?" },
  { id: "cq10", question: "O técnico explicou a diferença entre as redes Wi-Fi 2,4 GHz e 5 GHz?" },
  { id: "cq11", question: "O técnico explicou qual rede Wi-Fi é mais indicada em cada situação?" },
  { id: "cq12", question: "O técnico explicou que a velocidade do Wi-Fi pode variar conforme o celular, TV, computador ou outro aparelho utilizado?" },
  { id: "cq13", question: "O técnico explicou que distância e paredes podem reduzir o sinal Wi-Fi?" },
  { id: "cq14", question: "O técnico explicou que outros equipamentos e redes próximas podem causar interferências?" },
  { id: "cq15", question: "O técnico orientou sobre o melhor posicionamento do roteador?" },
  { id: "cq16", question: "O técnico demonstrou que a conexão estava funcionando antes de deixar o local?" },
  { id: "cq17", question: "O técnico explicou como verificar se uma possível falha está acontecendo de forma geral antes de acionar o suporte?" },
  { id: "cq18", question: "O ambiente foi deixado limpo e organizado?" },
  { id: "cq19", question: "Suas dúvidas foram esclarecidas pelo técnico?" },
  { id: "cq20", question: "Você está satisfeito(a) com o atendimento realizado?" },
];

export function normalizeCustomerCounterproofChecklist(
  input: unknown,
): CustomerCounterproofChecklist {
  const source = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as {
    version?: unknown;
    items?: unknown;
  };
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const byId = new Map<string, CustomerCounterproofAnswer>();
  const legacyOrdered: CustomerCounterproofAnswer[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { id?: unknown; answer?: unknown };
    const id = typeof item.id === "string" ? item.id : null;
    const answer = item.answer === "sim" || item.answer === "nao" ? item.answer : null;
    if (!answer) continue;
    if (id) byId.set(id, answer);
    legacyOrdered.push(answer);
  }
  const items: CustomerCounterproofChecklistItem[] = CUSTOMER_COUNTERPROOF_QUESTIONS.map((q, idx) => ({
    id: q.id,
    question: q.question,
    answer: byId.get(q.id) ?? legacyOrdered[idx] ?? "sim",
  }));
  const version =
    typeof source.version === "string" && source.version.length > 0
      ? source.version
      : CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION;
  return { version, items };
}
