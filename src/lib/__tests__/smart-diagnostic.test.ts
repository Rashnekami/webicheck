import { describe, expect, it } from "vitest";

import {
  createSmartDiagnosticSession,
  evaluateSmartDiagnostic,
  getNextDiagnosticQuestion,
  type SmartDiagnosticSession,
} from "@/lib/smart-diagnostic";

function sessionWith(
  symptoms: SmartDiagnosticSession["symptoms"],
  answers: SmartDiagnosticSession["answers"],
): SmartDiagnosticSession {
  return {
    ...createSmartDiagnosticSession(),
    symptoms,
    answers,
    history: Object.keys(answers),
  };
}

describe("motor do Diagnóstico Inteligente Beta", () => {
  it("não permite condenar a ONT antes de testar fonte homologada", () => {
    const session = sessionWith(["ont_nao_liga"], {
      ont_powered_now: "no",
      outlet_has_power: "yes",
    });

    expect(getNextDiagnosticQuestion(session)?.id).toBe("homologated_psu_tested");
    expect(evaluateSmartDiagnostic(session).noc.eligible).toBe(false);
    expect(evaluateSmartDiagnostic(session).noc.missing).toContain("Fonte homologada testada");
  });

  it("indica a fonte e elimina defeito físico quando a ONT volta com outra fonte", () => {
    const session = sessionWith(["ont_nao_liga"], {
      ont_powered_now: "no",
      outlet_has_power: "yes",
      homologated_psu_tested: "yes",
      power_after_psu: "yes",
      corrective_action: "psu_replaced",
      retest_performed: "yes",
      symptom_persists: "no",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.status).toBe("NORMALIZADO");
    expect(result.probableCause).toBe("Fonte");
    expect(result.eliminated).toContain("Defeito físico da ONT");
    expect(result.noc.eligible).toBe(false);
  });

  it("libera a simulação NOC para ONT sem ligar somente após evidências e reteste", () => {
    const session = sessionWith(["ont_nao_liga"], {
      ont_powered_now: "no",
      outlet_has_power: "yes",
      homologated_psu_tested: "yes",
      power_after_psu: "no",
      corrective_action: "no_action_solved",
      retest_performed: "yes",
      symptom_persists: "yes",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.status).toBe("POSSIVEL_DEFEITO_ONT");
    expect(result.noc.eligible).toBe(true);
    expect(result.noc.profile).toBe("ont_power");
  });

  it("descarta falha geral da ONT quando outro dispositivo funciona normalmente", () => {
    const session = sessionWith(["alguns_dispositivos"], {
      all_devices: "no",
      device_count: "one",
      comparison_device_tested: "yes",
      comparison_device_result: "yes",
      corrective_action: "client_device",
      retest_performed: "yes",
      symptom_persists: "no",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.probableCause).toBe("Dispositivo / compatibilidade");
    expect(result.eliminated).toContain("Falha geral da ONT");
    expect(result.noc.eligible).toBe(false);
  });

  it("trata indisponibilidade no Downdetector como serviço externo", () => {
    const session = sessionWith(["streaming"], {
      all_devices: "yes",
      wifi_network: "both",
      specific_service_only: "yes",
      other_services_normal: "yes",
      downdetector: "yes",
      corrective_action: "external_service",
      retest_performed: "yes",
      symptom_persists: "yes",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.probableCause).toBe("Serviço externo");
    expect(result.eliminated).toContain("Defeito da ONT");
    expect(result.noc.eligible).toBe(false);
  });

  it("libera a simulação NOC para porta LAN somente após eliminar cabo e dispositivo", () => {
    const session = sessionWith(["porta_lan"], {
      other_lan_port: "yes",
      other_lan_port_result: "no",
      other_ethernet_cable: "yes",
      other_lan_device: "yes",
      other_lan_device_result: "no",
      corrective_action: "lan_settings",
      retest_performed: "yes",
      symptom_persists: "yes",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.probableCause).toBe("Porta LAN / hardware");
    expect(result.noc.eligible).toBe(true);
    expect(result.noc.profile).toBe("lan");
  });

  it("exige recorrência, vários dispositivos, alimentação e óptica para o rádio 5 GHz", () => {
    const session = sessionWith(["wifi_5_desaparece"], {
      los_active: "no",
      optical_in_range: "yes",
      all_devices: "yes",
      wifi_network: "wifi5",
      wifi24_during_5_failure: "yes",
      wifi5_after_adjustment: "yes",
      wifi5_recurrent: "yes",
      wifi5_recurred_confirmed: "yes",
      wifi_power_stable: "yes",
      corrective_action: "wifi5_adjusted",
      retest_performed: "yes",
      symptom_persists: "yes",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.probableCause).toBe("Rádio 5 GHz / firmware");
    expect(result.noc.eligible).toBe(true);
    expect(result.noc.profile).toBe("radio_5");
  });

  it("mantém o atendimento aguardando quando o técnico ainda não realizou o reteste", () => {
    const session = sessionWith(["outro"], {
      other_description: "Falha intermitente observada no local",
      corrective_action: "customer_guidance",
      retest_performed: "no",
    });

    const result = evaluateSmartDiagnostic(session);
    expect(result.status).toBe("AGUARDANDO_TESTE");
    expect(getNextDiagnosticQuestion(session)?.id).toBe("retest_performed");
  });
});
