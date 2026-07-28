export const PROFILE_CITIES = [
  "Telêmaco Borba",
  "Imbaú",
  "Ponta Grossa",
  "Carambeí",
  "Tibagi",
  "Castro",
] as const;

export function isKnownProfileCity(value: string): boolean {
  return PROFILE_CITIES.includes(value as (typeof PROFILE_CITIES)[number]);
}

export type TerritoryCode = "alex" | "renan";

export const TERRITORIES: Record<TerritoryCode, { name: string; cities: string[] }> = {
  alex: { name: "Supervisão Alex", cities: ["Castro", "Carambeí", "Ponta Grossa"] },
  renan: { name: "Supervisão Renan", cities: ["Telêmaco Borba", "Imbaú", "Tibagi"] },
};

export function normalizeCity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function territoryOfCity(city: string): TerritoryCode | null {
  const key = normalizeCity(city);
  for (const [code, t] of Object.entries(TERRITORIES) as [TerritoryCode, { cities: string[] }][]) {
    if (t.cities.some((c) => normalizeCity(c) === key)) return code;
  }
  return null;
}

/** Cidades selecionadas -> todas as cidades dos territórios correspondentes. */
export function expandCitiesToTerritories(cities: string[]): string[] {
  const codes = new Set<TerritoryCode>();
  for (const c of cities) {
    const code = territoryOfCity(c);
    if (code) codes.add(code);
  }
  return [...codes].flatMap((code) => TERRITORIES[code].cities);
}

export function territoryNames(cities: string[]): string[] {
  const codes = new Set<TerritoryCode>();
  for (const c of cities) {
    const code = territoryOfCity(c);
    if (code) codes.add(code);
  }
  return [...codes].map((code) => TERRITORIES[code].name);
}
