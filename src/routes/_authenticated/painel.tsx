import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LogOut, ShieldCheck, HardHat, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel — Webifibra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { data: user, isLoading } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WebifibraLogo size={64} className="animate-pulse" />
      </div>
    );
  }

  const firstName = user.full_name?.split(" ")[0] || "técnico";

  return (
    <div className="min-h-screen bg-background">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <WebifibraLogo size={44} className="rounded-xl" />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">
                Webifibra
              </p>
              <h1 className="text-lg font-semibold">Checklist Técnico</h1>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSignOut}
            className="bg-white/15 text-white hover:bg-white/25"
          >
            <LogOut className="mr-1.5 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <section>
          <p className="text-sm text-muted-foreground">Olá,</p>
          <h2 className="text-2xl font-bold text-foreground">{firstName} 👋</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {user.isAdmin ? (
              <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Administrador
              </Badge>
            ) : (
              <Badge variant="secondary">
                <HardHat className="mr-1 h-3.5 w-3.5" /> Técnico de campo
              </Badge>
            )}
            {!user.active && (
              <Badge variant="destructive">Usuário bloqueado</Badge>
            )}
          </div>
        </section>

        <Card className="border-dashed">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">
                  Etapa 1 concluída — base pronta
                </h3>
                <p className="text-sm text-muted-foreground">
                  Autenticação, perfis, papéis (técnico/admin) e proteção de
                  rotas estão funcionando. Nas próximas etapas: modelos de
                  checklist, construtor, preenchimento em campo, autosave,
                  autorização do NOC, assinaturas, PDF permanente e painel
                  administrativo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="font-semibold text-foreground">Seu cadastro</h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium">{user.full_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Telefone</dt>
                <dd className="font-medium">{user.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Matrícula</dt>
                <dd className="font-medium">{user.matricula || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cidade / região</dt>
                <dd className="font-medium">{user.city || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">
                  {user.active ? "Ativo" : "Bloqueado"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
