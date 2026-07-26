import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  LogOut,
  ShieldCheck,
  HardHat,
  ClipboardList,
  ArrowRight,
  PenLine,
  BarChart3,
  UsersRound,
  Megaphone,
  Building2,
  PackageSearch,
  CheckCircle2,
  FileClock,
  Wifi,
  BrainCircuit,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser, updateAssinatura } from "@/hooks/use-current-user";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SignaturePad } from "@/components/signature-pad";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { InstallButton } from "@/components/pwa/install-button";
import { listAnnouncements } from "@/lib/provider-admin.functions";
import { listChecklists } from "@/lib/checklists";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [{ title: "Painel — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: Painel,
});

function ActiveAnnouncements() {
  const query = useQuery({ queryKey: ["announcements"], queryFn: () => listAnnouncements() });
  const notices = (query.data ?? []).filter((item) => item.active).slice(0, 3);
  if (notices.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Informativos ativos">
      {notices.map((notice) => (
        <Card
          key={notice.id}
          className={
            notice.severity === "critical"
              ? "webi-announcement border-rose-400/50 bg-rose-950/15"
              : notice.severity === "warning"
                ? "webi-announcement border-amber-400/50 bg-amber-950/15"
                : "webi-announcement border-cyan-400/40 bg-blue-950/35"
          }
        >
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            <div className="webi-icon h-12 w-12 shrink-0 rounded-full">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-cyan-400">
                Informativo operacional
              </p>
              <p className="mt-1 text-lg font-semibold text-white">{notice.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{notice.message}</p>
            </div>
            <ArrowRight className="hidden h-5 w-5 text-cyan-400 sm:block" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function HomeNavCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="webi-nav-card h-full">
        <CardContent className="flex h-full items-center gap-4 p-5 sm:p-6">
          <div className="webi-icon h-14 w-14 shrink-0 rounded-full">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white sm:text-lg">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{description}</p>
          </div>
          <div className="webi-icon h-10 w-10 shrink-0 rounded-full">
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function HomeStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
}) {
  return (
    <Card className="bg-gradient-to-br from-blue-950/70 to-slate-950/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="webi-icon h-11 w-11 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-white">{value}</p>
          <p className="text-xs leading-tight text-slate-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Painel() {
  const { data: user, isLoading } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState<string | null>(null);
  const [savingSig, setSavingSig] = useState(false);
  const homeChecklists = useQuery({
    queryKey: ["home-checklists", user?.id, user?.isAdmin],
    queryFn: () =>
      listChecklists({
        scope: user?.isAdmin ? "all" : "mine",
        userId: user!.id,
      }),
    enabled: !!user,
  });

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
  const currentRows = (homeChecklists.data ?? []).filter(
    (item) => (item as { is_current?: boolean }).is_current !== false,
  );
  const finalized = currentRows.filter((item) => item.status === "finalizado").length;
  const drafts = currentRows.filter((item) => item.status === "rascunho").length;
  const installations = currentRows.filter((item) => item.tipo === "instalacao").length;

  return (
    <div className="webi-page min-h-screen">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <WebifibraLogo size={44} className="rounded-xl" />
            <div>
              <p className="text-xs uppercase tracking-[.2em] text-cyan-400">Webifibra</p>
              <h1 className="text-lg font-semibold">Checklist Técnico</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <InstallButton
              variant="secondary"
              className="border-blue-400/30 bg-blue-500/10 text-cyan-100 hover:bg-blue-500/20"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSignOut}
              className="border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
        <section className="grid gap-6 lg:grid-cols-[.8fr_1.5fr] lg:items-end">
          <div>
            <p className="text-base text-slate-400">Olá,</p>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {firstName} <span aria-hidden>👋</span>
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {user.isAdmin ? (
                <Badge className="border-cyan-400/40 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Administrador
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <HardHat className="mr-1 h-3.5 w-3.5" /> Técnico de campo
                </Badge>
              )}
              {!user.active && <Badge variant="destructive">Usuário bloqueado</Badge>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HomeStat
              icon={ClipboardList}
              value={currentRows.length}
              label="Checklists registrados"
            />
            <HomeStat icon={CheckCircle2} value={finalized} label="Atendimentos finalizados" />
            <HomeStat icon={FileClock} value={drafts} label="Rascunhos em andamento" />
            <HomeStat icon={Wifi} value={installations} label="Checklists de instalação" />
          </div>
        </section>

        <ActiveAnnouncements />

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-400">
                Central operacional
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">Acessos principais</h2>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <HomeNavCard
              to="/checklists"
              icon={ClipboardList}
              title={user.isAdmin ? "Todos os checklists" : "Meus checklists"}
              description={
                user.isAdmin
                  ? "Fiscalize atendimentos, filtre por técnico e cidade e baixe documentos."
                  : "Registre novos atendimentos ou continue rascunhos em andamento."
              }
            />
            {user.isAdmin && (
              <HomeNavCard
                to="/dashboard"
                icon={BarChart3}
                title="Dashboard"
                description="Indicadores de trocas, técnicos, cidades e analistas com exportação."
              />
            )}
            {(user.isAdmin || user.isWarehouse) && (
              <HomeNavCard
                to="/trocas-ont"
                icon={PackageSearch}
                title="Trocas de ONT"
                description="Consulte ticket, equipamento retirado, serial e motivo."
              />
            )}
            <HomeNavCard
              to="/informativos"
              icon={Megaphone}
              title="Informativos"
              description="Plantões e comunicados operacionais da equipe."
            />
            {user.isAdmin && (
              <HomeNavCard
                to="/provedor"
                icon={Building2}
                title="Provedor e dispositivos"
                description="Situação comercial e computadores autorizados."
              />
            )}
            {user.isAdmin && (
              <HomeNavCard
                to="/usuarios"
                icon={UsersRound}
                title="Usuários"
                description="Consulte cadastros, edite perfis e controle acessos."
              />
            )}
            <HomeNavCard
              to="/integracoes"
              icon={PenLine}
              title="Integrações"
              description="Chaves para o Webi Diagnostic enviar documentos ao checklist."
            />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardContent className="space-y-3 p-5">
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
              <div className="rounded-xl border border-blue-400/15 bg-white p-3">
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

          <Card className="h-full">
            <CardContent className="space-y-3 p-5">
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
                  <dd className="font-medium">{user.active ? "Ativo" : "Bloqueado"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </section>
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
