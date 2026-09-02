import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Consulta must_change_password separado do resto do perfil: essa coluna
// só existe depois que a migration de auth hardening for aplicada no
// banco. Enquanto isso não acontecer (ou em qualquer outro erro nessa
// coluna específica), degrada para "false" em vez de derrubar o login
// inteiro — um erro aqui NUNCA deve ser tratado como "conta inativa".
async function fetchMustChangePassword(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { must_change_password?: boolean }).must_change_password);
}

// Managed gate — a autenticação depende do localStorage (sem SSR).
//
// Havia um AuthenticatedLayout aqui que, depois do beforeLoad já validar
// tudo (usuário, perfil ativo, cadastro completo, troca de senha
// pendente, provedor ativo), refazia as MESMAS 4 chamadas ao Supabase de
// novo num useEffect só pra decidir se mostrava <Outlet /> ou um spinner
// — dobrando a latência de toda navegação pra dentro da área autenticada
// (8 chamadas sequenciais no total) sem nenhum ganho: o beforeLoad já
// bloqueia a navegação inteira via throw redirect() se algo estiver
// errado, então se o componente chegou a montar é porque já passou.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("active, city, provider_id, platform_admin, cities_configured_at, contact_email")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.active) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    // O Postit! também atende Financeiro, RH, Marketing e Diretoria. Essas
    // pessoas precisam estar ligadas a um provedor, mas não necessariamente
    // possuir cidade/região técnica configurada.
    const postitAccountPath =
      location.pathname.startsWith("/postit") || location.pathname === "/minha-conta";
    if (
      !profile.provider_id ||
      !(profile as { contact_email?: string | null }).contact_email ||
      (!postitAccountPath && !profile.cities_configured_at)
    ) {
      throw redirect({ to: "/completar-cadastro" });
    }

    if (await fetchMustChangePassword(data.user.id)) {
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
  component: () => <Outlet />,
});
