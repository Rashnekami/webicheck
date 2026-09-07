import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { currentUserQueryOptions } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    if (typeof window === "undefined") return;
    // Revalidate access on every navigation, then reuse the same response in
    // useCurrentUser. Transient data errors reach the retry screen, not logout.
    const user = await context.queryClient.fetchQuery({
      ...currentUserQueryOptions(),
      staleTime: 0,
    });
    if (!user) throw redirect({ to: "/auth" });
    if (!user.active) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    const postitAccountPath =
      location.pathname === "/postit" ||
      location.pathname.startsWith("/postit/") ||
      location.pathname === "/minha-conta";
    const authEmail = user.authUser.email ?? "";
    const hasRealAuthEmail = authEmail.includes("@") && !authEmail.endsWith(".local");
    if (
      !user.provider_id ||
      (!user.contact_email && !hasRealAuthEmail) ||
      (!postitAccountPath && !user.cities_configured_at)
    ) {
      throw redirect({ to: "/completar-cadastro" });
    }
    if (user.must_change_password) throw redirect({ to: "/trocar-senha" });
    if (user.provider_status !== "active" && !user.platform_admin) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: user.authUser };
  },
  component: () => <Outlet />,
});
