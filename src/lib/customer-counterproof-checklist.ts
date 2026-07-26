export const CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION = "2.0.0";

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
  { id: "velocidade_ok", question: "O técnico realizou o teste de velocidade via cabo, comprovando a entrega da banda contratada?" },
  { id: "navegacao_ok", question: "A navegação e a estabilidade da conexão foram validadas no momento do atendimento?" },
  { id: "wifi_orientado", question: "Você foi orientado(a) sobre a diferença das redes Wi-Fi 5 GHz (mais velocidade e menor alcance) e 2,4 GHz (mais alcance e menor velocidade)?" },
  { id: "placa_orientado", question: "Foi explicado que a velocidade via Wi-Fi depende da capacidade da placa de rede dos seus aparelhos (celular, TV, console, etc.)?" },
  { id: "cabo_orientado", question: "Você foi orientado(a) a utilizar cabo de rede em Smart TVs, videogames e equipamentos que exigem maior estabilidade?" },
  { id: "posicionamento_ok", question: "O posicionamento do roteador foi validado e foram explicadas as possíveis interferências (paredes, móveis, espelhos, eletrodomésticos)?" },
  { id: "downdetector", question: "O técnico apresentou o site Downdetector e orientou a verificar quedas globais de aplicativos antes de acionar o suporte?" },
  { id: "duvidas_sanadas", question: "Suas dúvidas finais foram sanadas no local pelo técnico?" },
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
