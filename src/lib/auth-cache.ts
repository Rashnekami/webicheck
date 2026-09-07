import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";

/** One instance per mounted router; never shared across server requests. */
export function createAuthCacheHandler(queryClient: QueryClient, invalidateRouter: () => void) {
  let userId: string | null | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    handle(event: AuthChangeEvent, session: Session | null) {
      const nextUserId = session?.user.id ?? null;
      if (userId === undefined && event === "INITIAL_SESSION") {
        userId = nextUserId;
        return;
      }
      const changed = userId !== nextUserId;
      userId = nextUserId;

      // Clear synchronously, including pending queries, before another identity
      // can render. Repeated SIGNED_IN events for the same user are normal.
      if (changed || event === "SIGNED_OUT" || event === "USER_UPDATED") queryClient.clear();
      if (!changed && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

      // Supabase holds its auth lock during this callback. Queries/router guards
      // may call getUser/getSession, so start them after the callback returns.
      clearTimeout(timer);
      timer = setTimeout(() => {
        invalidateRouter();
      }, 0);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
