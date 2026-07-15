import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WebifibraLogo } from "@/components/webifibra-logo";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? "in" : "out");
    });
  }, []);

  if (state === "loading") {
    return (
      <div className="brand-gradient flex min-h-screen items-center justify-center">
        <WebifibraLogo size={72} className="animate-pulse" />
      </div>
    );
  }

  return <Navigate to={state === "in" ? "/painel" : "/auth"} replace />;
}
