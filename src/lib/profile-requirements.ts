export const FIELD_ROLES = ["tecnico", "supervisor", "noc", "almoxarifado"] as const;

const FIELD_ROLE_SET = new Set<string>(FIELD_ROLES);

/**
 * Cidade/região técnica é obrigatória apenas para perfis que executam
 * atividades operacionais de campo/rede. Perfis administrativos, RH,
 * diretoria e usuários exclusivos do Postit! não devem ser bloqueados
 * por ausência de cities_configured_at.
 */
export function requiresConfiguredCities(roles: readonly string[]): boolean {
  return roles.some((role) => FIELD_ROLE_SET.has(role));
}
