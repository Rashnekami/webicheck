import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  classifySignal,
  mergeSignalPreviews,
  parseSmartOltCsv,
} from "@/lib/signal-audit";

describe("signal audit classification", () => {
  it("ignores a healthy balanced signal", () => {
    expect(classifySignal(-22, -23)).toBeNull();
  });

  it("flags imbalance above 3 dB even with otherwise good levels", () => {
    expect(classifySignal(-20, -24)).toMatchObject({
      issue_kind: "desequilibrio",
      difference_db: 4,
      severity: "alto",
    });
  });

  it("flags low absolute signal at -25 dBm even without imbalance", () => {
    expect(classifySignal(-25, -24)).toMatchObject({
      issue_kind: "sinal_ruim",
      severity: "alto",
    });
  });

  it("flags both conditions and escalates critical levels", () => {
    expect(classifySignal(-28.5, -23)).toMatchObject({
      issue_kind: "ambos",
      severity: "critico",
    });
  });
});

describe("SmartOLT CSV batches", () => {
  const header = "SN,Name,OLT,Board,Port,Signal 1310,Signal 1490";

  it("uses the city selected by the supervisor instead of guessing it", () => {
    const csv = `${header}\nABC123,Cliente 1,OLT-X7,6,3,-28,-24`;
    const parsed = parseSmartOltCsv(csv, {
      city: "Telêmaco Borba",
      sourceFile: "placa-6.csv",
    });
    expect(parsed.rows[0]).toMatchObject({
      city: "Telêmaco Borba",
      board: "6",
      port: "3",
      source_file: "placa-6.csv",
    });
  });

  it("merges several plate files and deduplicates the same SN", () => {
    const first = parseSmartOltCsv(`${header}\nSN1,Cliente,OLT-X7,6,1,-26,-22`, {
      city: "Telêmaco Borba",
      sourceFile: "placa6.csv",
    });
    const second = parseSmartOltCsv(`${header}\nSN1,Cliente,OLT-X7,7,1,-29,-22`, {
      city: "Telêmaco Borba",
      sourceFile: "placa7.csv",
    });
    const merged = mergeSignalPreviews([first, second], "Telêmaco Borba");
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0].severity).toBe("critico");
    expect(merged.sourceFiles).toEqual(["placa6.csv", "placa7.csv"]);
  });
});
