import { describe, expect, it } from "vitest";

import {
  buildSanitizedAiInput,
  enforceAiGuardrails,
  type AiDiagnosticReviewBody,
} from "@/lib/smart-diagnostic-ai";
import {
  createDiagnosticDecisionEvent,
  createSmartDiagnosticSession,
  evaluateSmartDiagnostic,
  getDeterministicDivergences,
  getNextDiagnosticQuestion,
} from "@/lib/smart-diagnostic";

function baseReview(): AiDiagnosticReviewBody {
  return {
    status: "VALIDADO",
    diagnostico_provavel: "Possível falha física da ONT",
    confianca: 82,
    proxima_acao: "Trocar a ONT",
    testes_necessarios: [],
    divergencias: [],
    evidencias_faltantes: [],
    troca_ont_recomendada: true,
    necessita_noc_humano: false,
    justificativa: "Sintoma persiste.",
    resumo_tecnico: "Atendimento analisado.",
    fatos_nao_informados: [],
  };
}

describe("camada consultiva do Webi NOC", () => {
  it("remove dados diretos do cliente antes de montar a entrada da IA", () => {
    const session = createSmartDiagnosticSession();
    session.metadata.client = "Cliente Teste";
    session.metadata.workOrder = "58751";
    session.symptoms = ["outro"];
    session.answers.other_description =
      "Ligar para 42999999999 ou teste@cliente.com para confirmar.";

    const input = buildSanitizedAiInput(session, evaluateSmartDiagnostic(session), "triage");
    const serialized = JSON.stringify(input);

    expect(serialized).not.toContain("Cliente Teste");
    expect(serialized).not.toContain("58751");
    expect(serialized).not.toContain("42999999999");
    expect(serialized).not.toContain("teste@cliente.com");
    expect(serialized).toContain("[TELEFONE_REMOVIDO]");
    expect(serialized).toContain("[EMAIL_REMOVIDO]");
  });

  it("bloqueia sugestão de troca quando as regras obrigatórias não foram cumpridas", () => {
    const session = createSmartDiagnosticSession();
    session.symptoms = ["ont_nao_liga"];
    session.answers.ont_powered_now = "no";
    const evaluation = evaluateSmartDiagnostic(session);

    const result = enforceAiGuardrails(baseReview(), evaluation);

    expect(result.review.troca_ont_recomendada).toBe(false);
    expect(result.review.necessita_noc_humano).toBe(true);
    expect(result.review.status).toBe("PENDENCIA");
    expect(result.review.divergencias[0]?.codigo).toBe("AI_TROCA_BLOQUEADA");
  });

  it("não permite que a IA valide um atendimento sem reteste", () => {
    const session = createSmartDiagnosticSession();
    session.symptoms = ["outro"];
    session.answers = {
      other_description: "Falha intermitente",
      corrective_action: "customer_guidance",
      retest_performed: "no",
    };
    const evaluation = evaluateSmartDiagnostic(session);

    const result = enforceAiGuardrails(
      { ...baseReview(), troca_ont_recomendada: false },
      evaluation,
    );

    expect(result.review.status).toBe("PENDENCIA");
    expect(result.review.evidencias_faltantes).toContain("Reteste obrigatório não concluído.");
  });

  it("registra a pergunta, resposta, origem e evidência na trilha auditável", () => {
    const session = createSmartDiagnosticSession();
    session.symptoms = ["ont_nao_liga"];
    const question = getNextDiagnosticQuestion(session);
    expect(question).not.toBeNull();

    const event = createDiagnosticDecisionEvent(question!, "no");

    expect(event.questionId).toBe("ont_powered_now");
    expect(event.answerLabel).toBe("Não");
    expect(event.origin).toBe("technician");
    expect(event.evidence).toBe("Estado atual da ONT");
  });

  it("detecta contradição crítica entre normalização óptica e reteste final", () => {
    const session = createSmartDiagnosticSession();
    session.answers.connection_after_optical = "yes";
    session.answers.retest_performed = "yes";
    session.answers.symptom_persists = "yes";

    const divergences = getDeterministicDivergences(session);
    const evaluation = evaluateSmartDiagnostic(session);

    expect(divergences.some((item) => item.code === "OPTICAL_RESULT_CONFLICT")).toBe(true);
    expect(evaluation.status).toBe("DIVERGENCIA");
  });
});
