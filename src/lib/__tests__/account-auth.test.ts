import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
  from: vi.fn(),
}));
type Handler = (args: { next: (args: unknown) => unknown }) => Promise<unknown>;
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({ server: (handler: Handler) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mocks.request }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/security-log.server", () => ({ shouldSampleAccessLog: () => false }));
import { requireAccountAuth } from "@/lib/account-auth-middleware";
const authenticate = requireAccountAuth as unknown as Handler;

function row(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}
const next = vi.fn((value: unknown) => value);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.request.mockReturnValue(
    new Request("https://example.test/_serverFn/test", {
      headers: { authorization: "Bearer verified.test.token" },
    }),
  );
  mocks.createClient.mockReturnValue({ auth: { getClaims: mocks.getClaims }, from: mocks.from });
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-a" } }, error: null });
});

describe("Postit and account authentication", () => {
  it("allows an active nontechnical account without a city and keeps its verified identity", async () => {
    mocks.from
      .mockReturnValueOnce(
        row({ active: true, city: null, provider_id: "provider-a", platform_admin: false }),
      )
      .mockReturnValueOnce(row({ status: "active" }));
    await authenticate({ next });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ userId: "user-a" }) }),
    );
    expect(mocks.createClient.mock.calls[0][2].global.headers.Authorization).toBe(
      "Bearer verified.test.token",
    );
  });

  it.each([
    [false, "active", "Account inactive"],
    [true, "suspended", "Provider suspended"],
  ])("rejects active=%s, provider=%s", async (active, status, message) => {
    mocks.from
      .mockReturnValueOnce(row({ active, city: null, provider_id: "provider-a" }))
      .mockReturnValueOnce(row({ status }));
    await expect(authenticate({ next })).rejects.toThrow(message);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token that fails verification before reading any profile", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("Invalid JWT") });
    await expect(authenticate({ next })).rejects.toThrow("Invalid token");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when the profile cannot be read", async () => {
    mocks.from.mockReturnValueOnce(row(null, { message: "Database unavailable" }));
    await expect(authenticate({ next })).rejects.toThrow("Account inactive");
    expect(next).not.toHaveBeenCalled();
  });
});
