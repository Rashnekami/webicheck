export type CustomerCounterproofAnswer = "sim" | "nao";

export type CustomerCounterproofChecklistItem = {
  id: string;
  question: string;
  answer: CustomerCounterproofAnswer;
};

export type CustomerCounterproofChecklist = {
  version: "v1";
  items: CustomerCounterproofChecklistItem[];
};

export const CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION = "v1" as const;

export const CUSTOMER_COUNTERPROOF_QUESTIONS = [
  {
    id: "speed_test",
    question: "O técnico realizou o teste de velocidade e explicou o resultado?",
  },
  {
    id: "navigation_stability",
    question: "A navegação e a estabilidade da conexão foram verificadas com você?",
  },
  {
    id: "wifi_bands",
    question: "O técnico explicou a diferença entre as redes Wi-Fi 2,4 GHz e 5 GHz?",
  },
  {
    id: "device_limits",
    question:
      "Foi explicado que a velocidade no Wi-Fi também depende do celular, computador, TV ou outro aparelho utilizado?",
  },
  {
    id: "network_cable",
    question:
      "O técnico orientou quando usar cabo de rede em TVs, videogames e equipamentos que precisam de mais estabilidade?",
  },
  {
    id: "router_position",
    question:
      "O posicionamento do roteador e a influência de distância, paredes e interferências foram explicados?",
  },
  {
    id: "outage_check",
    question:
      "Você recebeu orientação sobre como verificar instabilidades gerais antes de acionar o suporte?",
  },
  {
    id: "questions_answered",
    question: "Você teve oportunidade de esclarecer suas dúvidas sobre o atendimento?",
  },
] as const;

export function normalizeCustomerCounterproofChecklist(
  value: CustomerCounterproofChecklist,
): CustomerCounterproofChecklist {
  if (!value || value.version !== CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION) {
    throw new Error("Versão do checklist do cliente inválida.");
  }

  if (!Array.isArray(value.items) || value.items.length !== CUSTOMER_COUNTERPROOF_QUESTIONS.length) {
    throw new Error("Responda todas as perguntas do checklist do cliente.");
  }

  const answerById = new Map(value.items.map((item) => [item.id, item.answer]));
  const items = CUSTOMER_COUNTERPROOF_QUESTIONS.map((question) => {
    const answer = answerById.get(question.id);
    if (answer !== "sim" && answer !== "nao") {
      throw new Error("Responda todas as perguntas com Sim ou Não.");
    }
    return {
      id: question.id,
      question: question.question,
      answer,
    };
  });

  if (answerById.size !== CUSTOMER_COUNTERPROOF_QUESTIONS.length) {
    throw new Error("O checklist do cliente contém respostas inválidas.");
  }

  return {
    version: CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION,
    items,
  };
}

