import type { AppRole } from "@/hooks/use-current-user";

export const FIELD_ROLES: AppRole[] = ["tecnico", "supervisor", "noc", "almoxarifado"];

export function requiresConfiguredCities(roles: readonly AppRole[]) {
  return roles.some((role) => FIELD_ROLES.includes(role));
}
