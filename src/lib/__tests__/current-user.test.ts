import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: api.getUser }, from: api.from },
}));
import { currentUserQueryOptions } from "@/hooks/use-current-user";

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.getUser.mockResolvedValue({
    data: { user: { id: "user-a", email: "a@example.test" } },
    error: null,
  });
});

describe("shared current user query", () => {
  it("reuses the guard response and preserves server-reported account restrictions", async () => {
    api.from.mockImplementation((table) => {
      if (table === "profiles")
        return query({ active: true, provider_id: "provider-a", must_change_password: true });
      if (table === "providers") return query({ name: "Example", status: "suspended" });
      return query([]);
    });
    const client = new QueryClient();
    const first = await client.fetchQuery({ ...currentUserQueryOptions(), staleTime: 0 });
    const second = await client.fetchQuery(currentUserQueryOptions());
    expect(second).toBe(first);
    expect(api.getUser).toHaveBeenCalledOnce();
    expect(first).toMatchObject({
      id: "user-a",
      must_change_password: true,
      provider_status: "suspended",
    });
    client.clear();
  });

  it("never defaults a missing profile to active", async () => {
    api.from.mockImplementation((table) => query(table === "profiles" ? null : []));
    const client = new QueryClient();
    expect(await client.fetchQuery(currentUserQueryOptions())).toMatchObject({ active: false });
    client.clear();
  });

  it("surfaces a database outage instead of classifying the account as inactive", async () => {
    const error = { message: "Database unavailable" };
    api.from.mockImplementation((table) => (table === "profiles" ? query(null, error) : query([])));
    const client = new QueryClient();
    await expect(client.fetchQuery(currentUserQueryOptions())).rejects.toEqual(error);
    client.clear();
  });

  it("treats a missing session as signed out without retrying", async () => {
    api.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    const client = new QueryClient();
    expect(await client.fetchQuery(currentUserQueryOptions())).toBeNull();
    expect(api.from).not.toHaveBeenCalled();
    client.clear();
  });
});
