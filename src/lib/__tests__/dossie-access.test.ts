import { describe, it, expect } from "vitest";
import { evaluateDossieAccess } from "@/lib/dossie-access";

const baseProfile = { id: "u1", active: true, provider_id: "p1" };
const baseProvider = { id: "p1", status: "active" };
const baseCase = { provider_id: "p1", tecnico_id: "tech1" };

describe("evaluateDossieAccess", () => {
  it("admin do mesmo provedor pode baixar", () => {
    const r = evaluateDossieAccess({
      profile: baseProfile,
      provider: baseProvider,
      case: baseCase,
      roles: ["admin"],
    });
    expect(r).toEqual({ ok: true, role: "admin" });
  });

  it("almoxarife do mesmo provedor pode baixar", () => {
    const r = evaluateDossieAccess({
      profile: baseProfile,
      provider: baseProvider,
      case: baseCase,
      roles: ["almoxarifado"],
    });
    expect(r.ok && r.role).toBe("almoxarifado");
  });

  it("técnico dono pode baixar seu próprio caso", () => {
    const r = evaluateDossieAccess({
      profile: { ...baseProfile, id: "tech1" },
      provider: baseProvider,
      case: baseCase,
      roles: ["tecnico"],
    });
    expect(r.ok && r.role).toBe("owner");
  });

  it("almoxarife de outro provedor recebe 403", () => {
    const r = evaluateDossieAccess({
      profile: { ...baseProfile, provider_id: "p2" },
      provider: baseProvider,
      case: baseCase,
      roles: ["almoxarifado"],
    });
    expect(r).toEqual({ ok: false, code: 403, reason: "different_provider" });
  });

  it("técnico comum de outro caso recebe 403", () => {
    const r = evaluateDossieAccess({
      profile: baseProfile,
      provider: baseProvider,
      case: baseCase,
      roles: ["tecnico"],
    });
    expect(r).toEqual({ ok: false, code: 403, reason: "missing_role" });
  });

  it("usuário inativo recebe 403 mesmo sendo admin", () => {
    const r = evaluateDossieAccess({
      profile: { ...baseProfile, active: false },
      provider: baseProvider,
      case: baseCase,
      roles: ["admin"],
    });
    expect(r).toEqual({ ok: false, code: 403, reason: "user_inactive" });
  });

  it("provedor suspenso bloqueia almoxarife", () => {
    const r = evaluateDossieAccess({
      profile: baseProfile,
      provider: { id: "p1", status: "suspended" },
      case: baseCase,
      roles: ["almoxarifado"],
    });
    expect(r).toEqual({ ok: false, code: 403, reason: "provider_suspended" });
  });

  it("caso inexistente devolve 404", () => {
    const r = evaluateDossieAccess({
      profile: baseProfile,
      provider: baseProvider,
      case: null,
      roles: ["admin"],
    });
    expect(r).toEqual({ ok: false, code: 404, reason: "case_not_found" });
  });

  it("provedor inexistente devolve 404", () => {
    const r = evaluateDossieAccess({
      profile: baseProfile,
      provider: null,
      case: baseCase,
      roles: ["admin"],
    });
    expect(r).toEqual({ ok: false, code: 404, reason: "provider_not_found" });
  });

  it("platform_admin ignora divergência de provedor", () => {
    const r = evaluateDossieAccess({
      profile: { ...baseProfile, provider_id: "p2" },
      provider: baseProvider,
      case: baseCase,
      roles: ["admin"],
      platformAdmin: true,
    });
    expect(r.ok).toBe(true);
  });
});
