export const CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION = "4.1.0";

export type CustomerCounterproofKind = "installation" | "maintenance";

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
  { id: "cq01", question: "O técnico foi até o local, se identificou e explicou o que seria feito?" },
  { id: "cq02", question: "Ao finalizar, o técnico explicou o serviço realizado e mostrou que a internet estava funcionando?" },
  { id: "cq03", question: "A internet ficou funcionando normalmente após o atendimento?" },
  { id: "cq04", question: "O técnico realizou um teste de velocidade e mostrou o resultado para você?" },
  { id: "cq05", question: "O técnico explicou a diferença entre as redes Wi-Fi 2,4 GHz e 5 GHz?" },
  { id: "cq06", question: "O técnico explicou que o sinal e a velocidade do Wi-Fi podem variar conforme o aparelho, a distância, as paredes e outras interferências?" },
  { id: "cq07", question: "O técnico orientou sobre o melhor posicionamento do roteador?" },
  { id: "cq08", question: "O técnico explicou como usar o Downdetector para verificar se existe alguma falha geral antes de entrar em contato com o suporte?" },
  { id: "cq09", question: "O local ficou organizado e suas dúvidas foram esclarecidas?" },
  { id: "cq10", question: "Você confirma que o serviço foi concluído e está satisfeito(a) com o atendimento?" },
];

export const CUSTOMER_MAINTENANCE_COUNTERPROOF_QUESTIONS: CustomerCounterproofQuestion[] = [
  { id: "mq01", question: "O técnico explicou o diagnóstico identificado no atendimento?" },
  { id: "mq02", question: "O técnico mostrou o funcionamento ou o resultado do teste realizado?" },
  { id: "mq03", question: "Você recebeu as orientações necessárias para o seu equipamento ou Wi-Fi?" },
  { id: "mq04", question: "O problema informado foi resolvido ou foi explicada a pendência existente?" },
  { id: "mq05", question: "Você confirma que teve oportunidade de esclarecer suas dúvidas?" },
  { id: "mq06", question: "Você confirma as orientações recebidas neste atendimento?" },
];

export function questionsForCounterproof(kind: CustomerCounterproofKind = "installation") {
  return kind === "maintenance"
    ? CUSTOMER_MAINTENANCE_COUNTERPROOF_QUESTIONS
    : CUSTOMER_COUNTERPROOF_QUESTIONS;
}


export function normalizeCustomerCounterproofChecklist(
  input: unknown,
  kind: CustomerCounterproofKind = "installation",
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
  const items: CustomerCounterproofChecklistItem[] = questionsForCounterproof(kind).map((q, idx) => ({
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
