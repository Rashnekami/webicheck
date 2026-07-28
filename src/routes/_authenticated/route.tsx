import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WebifibraLogo } from "@/components/webifibra-logo";
import {
  resolveCurrentProvider,
  ensureProviderBinding,
  isAllowedForProvider,
} from "@/lib/provider-resolution.functions";
import { getMyAuthStatus } from "@/lib/user-management.functions";

// Gate obrigatório de provider: única implementação, usada tanto pelo
// beforeLoad quanto pelo useEffect abaixo — cobre toda rota autenticada,
// inclusive o retorno do fluxo OAuth (que sempre passa por aqui antes de
// renderizar qualquer conteúdo protegido). Nunca cai em "root" por omissão
// em caso de erro — falha de resolução bloqueia (fail-closed).
async function checkProviderGate(): Promise<boolean> {
  try {
    const resolution = await resolveCurrentProvider();
    if (resolution.mode === "root") return true;
    if (resolution.mode === "invalid") return false;
    if (!resolution.provider.active) return false;

    // Tenta vincular um profile ainda sem provider (novo cadastro) ao
    // provider do Host atual. Nunca grava provider_id diretamente aqui —
    // quem faz isso, com trava atômica, é a própria função server-side.
    await ensureProviderBinding();

    return await isAllowedForProvider({
      data: { providerId: resolution.provider.id },
    });
  } catch {
    return false;
  }
}

// Managed gate — a autenticação depende do localStorage (sem SSR).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const allowed = await checkProviderGate();
    if (!allowed) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    const status = await getMyAuthStatus();
    if (status.must_change_password) throw redirect({ to: "/trocar-senha" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const allowed = await checkProviderGate();
      if (!allowed) {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
        return;
      }
      const status = await getMyAuthStatus();
      if (status.must_change_password) {
        navigate({ to: "/trocar-senha", replace: true });
        return;
      }
      setReady(true);
    })();
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
