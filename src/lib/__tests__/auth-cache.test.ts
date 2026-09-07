import { QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthCacheHandler } from "@/lib/auth-cache";

const session = (id: string) => ({ user: { id } }) as Session;
afterEach(() => vi.useRealTimers());

describe("session cache isolation", () => {
  it("does not reload every query when Supabase repeats SIGNED_IN", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const invalidate = vi.fn();
    const handler = createAuthCacheHandler(client, invalidate);
    handler.handle("INITIAL_SESSION", session("a"));
    client.setQueryData(["postit-workspace"], { owner: "a" });
    handler.handle("SIGNED_IN", session("a"));
    vi.runAllTimers();
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(["postit-workspace"])).toEqual({ owner: "a" });
  });

  it("clears private data immediately on logout and defers auth-dependent work", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const invalidate = vi.fn();
    const handler = createAuthCacheHandler(client, invalidate);
    handler.handle("INITIAL_SESSION", session("a"));
    client.setQueryData(["current-user"], { id: "a", isAdmin: true });
    client.setQueryData(["dashboard-checklists"], ["private"]);
    handler.handle("SIGNED_OUT", null);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(invalidate).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("cancels a pending response from the old account before switching", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const handler = createAuthCacheHandler(client, vi.fn());
    handler.handle("INITIAL_SESSION", session("a"));
    let finish!: (value: string) => void;
    const request = client
      .fetchQuery({
        queryKey: ["postit-workspace"],
        queryFn: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    handler.handle("SIGNED_IN", session("b"));
    finish("a's private workspace");
    await request;
    expect(client.getQueryData(["postit-workspace"])).toBeUndefined();
    handler.dispose();
  });
});
