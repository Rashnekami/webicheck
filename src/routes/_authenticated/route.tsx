import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WebifibraLogo } from "@/components/webifibra-logo";

// Managed gate — a autenticação depende do localStorage (sem SSR).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("active, city, provider_id, platform_admin, cities_configured_at, must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.active) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (!profile.provider_id || !profile.cities_configured_at) {
      throw redirect({ to: "/completar-cadastro" });
    }
    if (profile.must_change_password) {
      throw redirect({ to: "/trocar-senha" });
    }
    const { data: provider } = await supabase
      .from("providers")
      .select("status")
      .eq("id", profile.provider_id)
      .maybeSingle();
    if (provider?.status !== "active" && !profile.platform_admin) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("active, city, provider_id, platform_admin, cities_configured_at, must_change_password")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile?.active) {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
        return;
      }
      if (!profile.provider_id || !profile.cities_configured_at) {
        navigate({ to: "/completar-cadastro", replace: true });
        return;
      }
      if (profile.must_change_password) {
        navigate({ to: "/trocar-senha", replace: true });
        return;
      }
      const { data: provider } = await supabase
        .from("providers")
        .select("status")
        .eq("id", profile.provider_id)
        .maybeSingle();
      if (provider?.status !== "active" && !profile.platform_admin) {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
        return;
      }
      setReady(true);
    });
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WebifibraLogo size={64} className="animate-pulse" />
      </div>
    );
  }

  return <Outlet />;
}
