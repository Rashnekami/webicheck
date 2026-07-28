import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [{ title: "Minha conta — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: MinhaContaPage,
});

function MinhaContaPage() {
  const [linking, setLinking] = useState(false);

  const identitiesQuery = useQuery({
    queryKey: ["my-identities"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      return data.identities ?? [];
    },
  });

  const googleLinked = (identitiesQuery.data ?? []).some((i) => i.provider === "google");

  // Vínculo explícito, feito pelo próprio usuário logado — nunca cria
  // conta nova. Requer "Manual Linking" habilitado no Supabase Auth
  // (Dashboard > Authentication > Settings), fora do que dá pra
  // configurar por código/migration.
  async function linkGoogle() {
    setLinking(true);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/minha-conta` },
      });
      if (error) {
        toast.error(
          error.message.includes("Manual linking")
            ? "Vínculo de conta desativado no momento. Fale com o suporte."
            : "Não foi possível iniciar o vínculo com o Google.",
        );
        setLinking(false);
      }
      // Sucesso redireciona o navegador para o Google — não há mais nada
      // a fazer aqui, a página recarrega em /minha-conta ao voltar.
    } catch {
      toast.error("Não foi possível iniciar o vínculo com o Google.");
      setLinking(false);
    }
  }

  return (
    <div className="webi-page mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <span className="webi-icon h-11 w-11">
            <KeyRound className="h-5 w-5" />
          </span>
          Minha conta
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conta Google</CardTitle>
          <CardDescription>
            Depois de vinculada, você pode entrar com o botão "Continuar com Google" na tela de
            login, sem digitar provedor, login e senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {identitiesQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : googleLinked ? (
            <Badge className="border-emerald-400/30 bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Conta Google vinculada
            </Badge>
          ) : (
            <Button onClick={linkGoogle} disabled={linking}>
              {linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vincular conta Google
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
