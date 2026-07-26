import { describe, expect, it } from "vitest";
import {
  CUSTOMER_COUNTERPROOF_QUESTIONS,
  normalizeCustomerCounterproofChecklist,
} from "@/lib/customer-counterproof-checklist";

describe("normalizeCustomerCounterproofChecklist", () => {
  it("preserva as perguntas oficiais e aceita respostas Sim/Não", () => {
    const result = normalizeCustomerCounterproofChecklist({
      version: "v1",
      items: CUSTOMER_COUNTERPROOF_QUESTIONS.map((question, index) => ({
        id: question.id,
        question: "texto enviado pelo navegador",
        answer: index === 0 ? "nao" : "sim",
      })),
    });

    expect(result.items).toHaveLength(CUSTOMER_COUNTERPROOF_QUESTIONS.length);
    expect(result.items[0]).toEqual({
      ...CUSTOMER_COUNTERPROOF_QUESTIONS[0],
      answer: "nao",
    });
    expect(result.items[1].question).toBe(CUSTOMER_COUNTERPROOF_QUESTIONS[1].question);
  });

  it("rejeita checklist incompleto", () => {
    expect(() =>
      normalizeCustomerCounterproofChecklist({
        version: "v1",
        items: [],
      }),
    ).toThrow("Responda todas as perguntas");
  });

  it("rejeita identificador de pergunta adulterado", () => {
    const items: Array<{ id: string; question: string; answer: "sim" }> =
      CUSTOMER_COUNTERPROOF_QUESTIONS.map((question) => ({
      id: question.id,
      question: question.question,
      answer: "sim" as const,
      }));
    items[0] = { ...items[0], id: "outra_pergunta" };

    expect(() =>
      normalizeCustomerCounterproofChecklist({
        version: "v1",
        items,
      }),
    ).toThrow();
  });
});
