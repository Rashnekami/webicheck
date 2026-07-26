export const PROFILE_CITIES = [
  "Telêmaco Borba",
  "Tibagi",
  "Imbaú",
  "Ponta Grossa",
  "Castro",
  "Carambeí",
] as const;

export function isKnownProfileCity(value: string): boolean {
  return PROFILE_CITIES.includes(value as (typeof PROFILE_CITIES)[number]);
}
