import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  LogOut,
  ShieldCheck,
  ShieldAlert,
  HardHat,
  ClipboardList,
  ArrowRight,
  PenLine,
  BarChart3,
  UsersRound,
  Megaphone,
  Building2,
  PackageSearch,
  MapPinned,
  Cable,
  CheckCircle2,
  FileClock,
  Wifi,
  MapPin,
  Zap,
  KeyRound,
  Menu,
  GraduationCap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { CheckTecnicoMark } from "@/components/checktecnico-brand";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { listAnnouncements } from "@/lib/provider-admin.functions";
import { getChecklistCounts } from "@/lib/checklists";
import { getTechnicalFeedbackAccess } from "@/lib/technical-reviews.functions";
import { getWhistleblowerAccess } from "@/lib/whistleblower-admin.functions";
import { GoogleReviewLinksInternal } from "@/components/google-review-links-internal";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [{ title: "Painel — CheckTecnico" }, { name: "robots", content: "noindex" }],
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
            "webi-announcement overflow-hidden shadow-lg " +
            (notice.severity === "critical"
              ? "border-2 border-rose-400 bg-gradient-to-r from-rose-950/60 via-rose-900/30 to-rose-950/60 shadow-rose-500/20"
              : notice.severity === "warning"
                ? "border-2 border-amber-400 bg-gradient-to-r from-amber-950/60 via-amber-900/30 to-amber-950/60 shadow-amber-500/20"
                : "border-2 border-cyan-400 bg-gradient-to-r from-cyan-950/60 via-blue-900/30 to-cyan-950/60 shadow-cyan-500/20")
          }
        >
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div
              className={
                "webi-icon h-12 w-12 shrink-0 rounded-full " +
                (notice.severity === "critical"
                  ? "animate-pulse bg-rose-500/25 text-rose-300"
                  : notice.severity === "warning"
                    ? "animate-pulse bg-amber-500/25 text-amber-300"
                    : "bg-cyan-500/25 text-cyan-300")
              }
            >
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={
                  "text-[11px] font-bold uppercase tracking-[.2em] " +
                  (notice.severity === "critical"
                    ? "text-rose-300"
                    : notice.severity === "warning"
                      ? "text-amber-300"
                      : "text-cyan-300")
                }
              >
                Informativo operacional
              </p>
              <p className="mt-1 text-lg font-semibold text-white">{notice.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{notice.message}</p>
            </div>
            {(notice as { image_url?: string | null }).image_url ? (
              <img
                src={(notice as { image_url?: string | null }).image_url ?? undefined}
                alt=""
                className="h-28 w-full shrink-0 rounded-lg border border-white/10 object-cover sm:w-40"
              />
            ) : null}
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
  const homeCounts = useQuery({
    queryKey: ["home-checklist-counts", user?.id, user?.isAdmin],
    queryFn: () =>
      getChecklistCounts({
        scope: user?.isAdmin ? "all" : "mine",
        userId: user!.id,
      }),
    enabled: !!user,
  });
  const wbAccess = useQuery({
    queryKey: ["wb-access"],
    queryFn: () => getWhistleblowerAccess(),
    enabled: !!user,
    staleTime: 300_000,
  });
  const feedbackAccess = useQuery({
    queryKey: ["technical-feedback-access"],
    queryFn: () => getTechnicalFeedbackAccess(),
    enabled: !!user,
    staleTime: 300_000,
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
        <CheckTecnicoMark size={64} className="animate-pulse" />
      </div>
    );
  }

  const firstName = user.full_name?.split(" ")[0] || "técnico";
  const total = homeCounts.data?.total ?? 0;
  const finalized = homeCounts.data?.finalized ?? 0;
  const drafts = homeCounts.data?.drafts ?? 0;
  const installations = homeCounts.data?.installations ?? 0;

  return (
    <div className="webi-page min-h-screen">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <CheckTecnicoMark size={44} />
            <div className="min-w-0">
              {/* Marca da plataforma com o nome do provedor ao lado: em
                  instalação multi-ISP o técnico precisa ver de qual
                  operação é a conta em que está logado. O nome vem do
                  cadastro do provedor, não fica fixo no código. */}
              <h1 className="truncate text-lg font-semibold">
                Check<span className="text-emerald-400">Tecnico</span>
                {user.provider_name ? (
                  <span className="font-normal text-slate-300"> · {user.provider_name}</span>
                ) : null}
              </h1>
              <p className="text-xs uppercase tracking-[.2em] text-cyan-400">Checklist Técnico</p>
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
        {/* Setor de RH: acesso restrito ao Canal Ético e às Avaliações
            Técnicas — nada de checklists, dashboards ou cadastros. */}
        {user.isRh && (
          <section className="space-y-4">
            <div>
              <p className="text-base text-slate-400">Olá,</p>
              <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {firstName} <span aria-hidden>👋</span>
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className="border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300 hover:bg-fuchsia-400/15">
                  <UsersRound className="mr-1 h-3.5 w-3.5" /> Recursos Humanos
                </Badge>
                {!user.active && <Badge variant="destructive">Usuário bloqueado</Badge>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <HomeNavCard
                to="/canal-etico"
                icon={ShieldAlert}
                title="Canal Ético"
                description="Denúncias recebidas pelo canal confidencial, com trilha de auditoria."
              />
              <HomeNavCard
                to="/avaliacoes"
                icon={GraduationCap}
                title="Avaliação Técnica Interna"
                description="Avaliações e feedbacks dos colaboradores, com apoio de IA."
              />
            </div>
          </section>
        )}

        {!user.isRh && (
          <>
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
              value={total}
              label="Checklists registrados"
            />
            <HomeStat icon={CheckCircle2} value={finalized} label="Atendimentos finalizados" />
            <HomeStat icon={FileClock} value={drafts} label="Rascunhos em andamento" />
            <HomeStat icon={Wifi} value={installations} label="Checklists de instalação" />
          </div>
        </section>

        <ActiveAnnouncements />

        <GoogleReviewLinksInternal />

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-400">
                Central operacional
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">Fazer checklist</h2>
            </div>
            {/* O resto (dashboard, remapeamentos, usuários etc.) era uma
                grade de até 11 cards sempre visíveis — poluía a tela
                inicial. Fica escondido num submenu; só a ação principal
                (checklist) continua em destaque. */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  size="sm"
                  className="border-0 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30 hover:from-cyan-400 hover:to-blue-500"
                >
                  <Menu className="mr-1.5 h-4 w-4" /> Mais opções
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Mais opções</SheetTitle>
                  <SheetDescription>Acessos administrativos e operacionais.</SheetDescription>
                </SheetHeader>
                <div className="mt-4 grid gap-3">
                  {user.isAdmin && (
                    <HomeNavCard
                      to="/dashboard"
                      icon={BarChart3}
                      title="Dashboard"
                      description="Indicadores de trocas, técnicos, cidades e analistas com exportação."
                    />
                  )}
                  {(user.isAdmin || user.isSupervisor || user.isPlatformAdmin) && (
                    <HomeNavCard
                      to="/mapa-optico"
                      icon={Cable}
                      title="Mapa Óptico Inteligente (teste)"
                      description="CEO, splitters, cabos e CTOs em rota rastreável — módulo experimental."
                    />
                  )}
                  {(user.isAdmin || user.isSupervisor || user.isPlatformAdmin) && (
                    <HomeNavCard
                      to="/ctos"
                      icon={MapPinned}
                      title="CTOs por cidade"
                      description="Importe planilhas de CTOs e veja o status de remapeamento por cidade."
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
                    to="/remapeamentos"
                    icon={MapPin}
                    title="Remapeamentos"
                    description="CTOs/NAPs remapeadas com código RMAP, mapa satélite e indicadores."
                  />
                  <HomeNavCard
                    to="/intervencoes"
                    icon={Zap}
                    title="Intervenções de rede"
                    description="Rompimentos, readequações e melhorias de sinal com rota, OTDR e indicadores."
                  />
                  <HomeNavCard
                    to="/minha-conta"
                    icon={KeyRound}
                    title="Minha conta"
                    description="Vincule sua conta Google para entrar sem digitar login e senha."
                  />
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
                  {(user.isAdmin || user.isPlatformAdmin) && (
                    <HomeNavCard
                      to="/plataforma"
                      icon={ShieldCheck}
                      title={user.isPlatformAdmin ? "Plataforma" : "Credenciais do provedor"}
                      description={
                        user.isPlatformAdmin
                          ? "Crie provedores, personalize logo/cores/template e gere logins internos."
                          : "Crie logins e senhas para sua equipe."
                      }
                    />
                  )}
                  {(user.isAdmin || user.isPlatformAdmin) && (
                    <HomeNavCard
                      to="/seguranca"
                      icon={ShieldAlert}
                      title="Segurança"
                      description="Tentativas de login e acessos recentes, com IP e localização."
                    />
                  )}
                  {wbAccess.data?.hasAccess && (
                    <HomeNavCard
                      to="/canal-etico"
                      icon={ShieldAlert}
                      title="Canal Ético"
                      description="Denúncias recebidas pelo canal confidencial, com trilha de auditoria."
                    />
                  )}
                  {feedbackAccess.data?.hasAccess && (
                    <HomeNavCard
                      to="/avaliacoes"
                      icon={GraduationCap}
                      title="Avaliação Técnica Interna"
                      description="Módulo privado de avaliação técnica e feedback com apoio de IA."
                    />
                  )}
                  <HomeNavCard
                    to="/integracoes"
                    icon={PenLine}
                    title="Integrações"
                    description="Chaves para o Webi Diagnostic enviar documentos ao checklist."
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
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
          </>
        )}
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
