export const PROFILE_CITIES = [
  "Telêmaco Borba",
  "Imbaú",
  "Tibagi",
  "Ortigueira",
  "Reserva",
  "Curiúva",
  "São Jerônimo da Serra",
  "Ventania",
] as const;

export function isKnownProfileCity(value: string): boolean {
  return PROFILE_CITIES.includes(value as (typeof PROFILE_CITIES)[number]);
}
