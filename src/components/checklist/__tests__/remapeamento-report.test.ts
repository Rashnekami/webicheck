import { describe, expect, it } from "vitest";
import { buildRemapReport, chunkPorts, remapBlockingMessages } from "@/lib/remapeamento-report";
import { emptyRemapeamentoData } from "@/lib/checklist-schema";
import { portsForSplitter } from "@/lib/remapeamento-fibers";

function fixture() {
  const d = emptyRemapeamentoData();
  d.identificacao = { setor: "Setor 3", cto_codigo: "CTO-1042" };
  d.localizacao.ativo = {
    tipo: "cto",
    lat: -24.79,
    lng: -50.01,
    confirmed: true,
    confirmed_at: "2026-08-03T18:00:00Z",
  };
  d.localizacao.distancia_m = 15;
  d.splitter = { tipo: "1x16", tipo_outro: "", potencia_entrada_dbm: "-18.20" };
  d.portas = portsForSplitter("1x16");
  d.portas[0] = { ...d.portas[0], status: "ocupada", cliente: "Cliente A", potencia_dbm: "-22.10" };
  d.portas[1] = { ...d.portas[1], status: "ocupada", cliente: "Cliente B", potencia_dbm: "-23.40" };
  d.fusao = { necessaria: "sim", itens: [] };
  d.resultado = { estado: "sim", pendencia: "" };
  return d;
}

describe("relatório de remapeamento", () => {
  it("marca REGISTRO COM PENDÊNCIA quando a fusão não é detalhada", () => {
    const r = buildRemapReport(fixture());
    expect(r.status).toBe("pendencia");
    expect(r.statusLabel).toBe("REGISTRO COM PENDÊNCIA");
    expect(r.conclusion).toBe("Remapeamento registrado com pendência: fusão sem detalhamento.");
    expect(r.conclusion).not.toContain("integralmente");
    expect(remapBlockingMessages(fixture()).length).toBeGreaterThan(0);
  });

  it("conclui integralmente quando a fusão é detalhada", () => {
    const d = fixture();
    d.fusao = { necessaria: "sim", itens: [{ fibra: "Azul", motivo: "Rompimento", antes_dbm: "-24", depois_dbm: "-22" }] };
    const r = buildRemapReport(d);
    expect(r.status).toBe("concluido");
    expect(r.conclusion).toBe("CTO remapeada integralmente.");
  });

  it("resume as portas e não gera NaN sem leituras", () => {
    const r = buildRemapReport(fixture());
    expect(r.portSummary).toMatchObject({ total: 16, ocupadas: 2, livres: 14 });
    expect(r.stats.media_saida_dbm).not.toBeNaN();
    expect(r.portPages).toHaveLength(1);
    expect(chunkPorts(new Array(64).fill(null).map((_, i) => ({ numero: i + 1, cor: "azul", status: "livre" as const }))).length).toBe(3);
  });
});
