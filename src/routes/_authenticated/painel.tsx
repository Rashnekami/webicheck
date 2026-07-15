import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, HardHat, ClipboardList, ArrowRight, PenLine, BarChart3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, updateAssinatura } from "@/hooks/use-current-user";
import { useQueryClient } from "@tanstack/react-query";
import { SignaturePad } from "@/components/signature-pad";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState<string | null>(null);
  const [savingSig, setSavingSig] = useState(false);

  // Recupera assinatura pendente do signup (quando sessão só chegou depois)
  useEffect(() => {
    if (!user || user.assinatura) return;
    try {
      const pending = localStorage.getItem("webifibra.pending_signature");
      if (pending) {
        updateAssinatura(user.id, pending)
          .then(() => {
            localStorage.removeItem("webifibra.pending_signature");
            qc.invalidateQueries({ queryKey: ["current-user"] });
          })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [user, qc]);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/auth", replace: true });
  }

  async function handleSaveSig() {
    if (!user || !sigDraft) return;
    setSavingSig(true);
    try {
      await updateAssinatura(user.id, sigDraft);
      await qc.invalidateQueries({ queryKey: ["current-user"] });
      toast.success("Assinatura atualizada.");
      setSigOpen(false);
      setSigDraft(null);
    } catch {
      toast.error("Não foi possível salvar a assinatura.");
    } finally {
      setSavingSig(false);
    }
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

        <Link to="/checklists" className="block">
          <Card className="transition hover:border-primary/50 hover:shadow-md">
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">
                    {user.isAdmin ? "Todos os checklists" : "Meus checklists"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {user.isAdmin
                      ? "Fiscalize atendimentos, filtre por técnico/cidade e baixe PDFs."
                      : "Registre novos atendimentos ou continue rascunhos em andamento."}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        {user.isAdmin && (
          <Link to="/dashboard" className="block">
            <Card className="transition hover:border-primary/50 hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">Dashboard</h3>
                    <p className="text-sm text-muted-foreground">
                      Gráficos de trocas, técnicos, cidades e analistas — com
                      exportação em CSV.
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">Sua assinatura</h3>
                <p className="text-sm text-muted-foreground">
                  Aparece automaticamente em cada checklist finalizado.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSigDraft(user.assinatura ?? null);
                  setSigOpen(true);
                }}
              >
                <PenLine className="mr-1.5 h-4 w-4" />
                {user.assinatura ? "Alterar" : "Cadastrar"}
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              {user.assinatura ? (
                <img
                  src={user.assinatura}
                  alt="Assinatura"
                  className="mx-auto h-24 object-contain"
                />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma assinatura cadastrada.
                </p>
              )}
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

      <Dialog open={sigOpen} onOpenChange={setSigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sua assinatura</DialogTitle>
            <DialogDescription>
              Assine com o dedo ou caneta. Ela será usada em todos os PDFs.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad value={sigDraft} onChange={setSigDraft} height={180} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSigOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSig} disabled={!sigDraft || savingSig}>
              {savingSig ? "Salvando..." : "Salvar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
