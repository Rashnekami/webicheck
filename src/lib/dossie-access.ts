// Pure authorization helper for dossie access.
// Isolated from server-only imports so it can be exercised in unit tests.

export type DossieRole = "admin" | "almoxarifado" | "owner";

export interface DossieProfileLike {
  id: string;
  active: boolean;
  provider_id: string;
}

export interface DossieProviderLike {
  id: string;
  status: string; // "active" | "suspended" | "cancelled"
}

export interface DossieCaseLike {
  provider_id: string;
  tecnico_id: string;
}

export interface DossieAccessInput {
  profile: DossieProfileLike | null;
  provider: DossieProviderLike | null;
  case: DossieCaseLike | null;
  roles: string[]; // ex.: ["admin"], ["almoxarifado"], ["tecnico"]
  platformAdmin?: boolean;
}

export type DossieAccessResult =
  | { ok: true; role: DossieRole }
  | { ok: false; code: 403 | 404; reason: string };

/**
 * Decide se o usuário autenticado pode baixar o dossiê do atendimento.
 * Regra: (admin OU almoxarifado) do mesmo provedor ativo, OU técnico dono.
 * Usuários inativos, provedores suspensos e provedores diferentes recebem 403.
 */
export function evaluateDossieAccess(input: DossieAccessInput): DossieAccessResult {
  const { profile, provider, case: caseRow, roles, platformAdmin } = input;

  if (!caseRow) return { ok: false, code: 404, reason: "case_not_found" };
  if (!profile) return { ok: false, code: 403, reason: "profile_missing" };
  if (!profile.active) return { ok: false, code: 403, reason: "user_inactive" };

  const sameProvider = profile.provider_id === caseRow.provider_id;
  const providerActive = provider?.status === "active";
  const isPlatformAdmin = platformAdmin === true;

  if (!sameProvider && !isPlatformAdmin) {
    return { ok: false, code: 403, reason: "different_provider" };
  }
  // Platform admin pode operar mesmo em provedor de outra base, mas o provedor
  // precisa continuar existindo (não cancelado). Provedor suspenso bloqueia todos.
  if (!provider) return { ok: false, code: 404, reason: "provider_not_found" };
  if (!providerActive && !isPlatformAdmin) {
    return { ok: false, code: 403, reason: "provider_suspended" };
  }

  const isAdmin = roles.includes("admin");
  const isWarehouse = roles.includes("almoxarifado");
  const isOwner = profile.id === caseRow.tecnico_id;

  if (isAdmin) return { ok: true, role: "admin" };
  if (isWarehouse) return { ok: true, role: "almoxarifado" };
  if (isOwner) return { ok: true, role: "owner" };

  return { ok: false, code: 403, reason: "missing_role" };
}
