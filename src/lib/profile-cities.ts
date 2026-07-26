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
