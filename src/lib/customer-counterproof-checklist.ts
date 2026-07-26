export const CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION = "1.0.0";

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
  { id: "atendimento_realizado", question: "O atendimento técnico foi realizado no local?" },
  { id: "tecnico_identificado", question: "O técnico se identificou adequadamente?" },
  { id: "servico_explicado", question: "O técnico explicou o serviço executado?" },
  { id: "internet_funcionando", question: "A conexão de internet está funcionando corretamente após o atendimento?" },
  { id: "ambiente_organizado", question: "O ambiente foi mantido organizado ao final do atendimento?" },
  { id: "duvidas_esclarecidas", question: "Suas dúvidas foram esclarecidas pelo técnico?" },
  { id: "satisfeito_atendimento", question: "Você está satisfeito(a) com o atendimento prestado?" },
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
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { id?: unknown; answer?: unknown };
    const id = typeof item.id === "string" ? item.id : null;
    const answer = item.answer === "sim" || item.answer === "nao" ? item.answer : null;
    if (id && answer) byId.set(id, answer);
  }
  const items: CustomerCounterproofChecklistItem[] = CUSTOMER_COUNTERPROOF_QUESTIONS.map((q) => ({
    id: q.id,
    question: q.question,
    answer: byId.get(q.id) ?? "sim",
  }));
  const version =
    typeof source.version === "string" && source.version.length > 0
      ? source.version
      : CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION;
  return { version, items };
}
