import { describe, expect, it } from "vitest";
import { requiresConfiguredCities } from "@/lib/profile-requirements";

describe("profile city requirements", () => {
  it("requires configured cities for technical roles", () => {
    expect(requiresConfiguredCities(["tecnico"])).toBe(true);
    expect(requiresConfiguredCities(["supervisor"])).toBe(true);
    expect(requiresConfiguredCities(["noc"])).toBe(true);
    expect(requiresConfiguredCities(["almoxarifado"])).toBe(true);
  });

  it("does not require cities for administrative and Postit-only roles", () => {
    expect(requiresConfiguredCities([])).toBe(false);
    expect(requiresConfiguredCities(["rh"])).toBe(false);
    expect(requiresConfiguredCities(["admin"])).toBe(false);
    expect(requiresConfiguredCities(["rh", "admin"])).toBe(false);
  });

  it("requires cities when a mixed-role account has any technical role", () => {
    expect(requiresConfiguredCities(["rh", "supervisor"])).toBe(true);
  });
});
