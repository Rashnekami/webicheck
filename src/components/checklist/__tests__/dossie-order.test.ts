import { describe, it, expect } from "vitest";
import { orderRevisionsForDossie } from "@/components/checklist/dossie-pdf";
import type { DossieRevision } from "@/lib/warehouse-dossie.functions";

function makeRev(rev: number, id = `c${rev}`): DossieRevision {
  return {
    checklist: {
      id,
      revision_number: rev,
      case_id: "case-1",
      service_stage: rev === 1 ? "initial" : "post_ont_change",
      revision_reason: rev === 1 ? null : "troca",
      parent_checklist_id: rev === 1 ? null : `c${rev - 1}`,
      is_current: rev === 3,
      tipo: "validacao_ont",
      // demais campos irrelevantes para o teste de ordenação
    } as unknown as DossieRevision["checklist"],
    tecnico: null,
    fotos: [],
    diagnostics: [],
  };
}

describe("orderRevisionsForDossie", () => {
  it("ordena R1 → Rn mesmo com entrada embaralhada", () => {
    const input = [makeRev(3), makeRev(1), makeRev(2)];
    const out = orderRevisionsForDossie(input);
    expect(out.map((r) => r.checklist.revision_number)).toEqual([1, 2, 3]);
  });

  it("mantém a ordem quando já vem correta", () => {
    const input = [makeRev(1), makeRev(2)];
    const out = orderRevisionsForDossie(input);
    expect(out).toEqual(input);
  });

  it("não muta o array recebido", () => {
    const input = [makeRev(2), makeRev(1)];
    const snapshot = input.map((r) => r.checklist.revision_number);
    orderRevisionsForDossie(input);
    expect(input.map((r) => r.checklist.revision_number)).toEqual(snapshot);
  });
});
