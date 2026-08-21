import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  NotebookPen,
  Plus,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTechnicalReview,
  getTechnicalFeedbackAccess,
  listEvaluableEmployees,
  listTechnicalFeedbackAccess,
  listTechnicalReviews,
  listMonthlyTechnicalEmployeeNotes,
  analyzeTechnicalEmployeeNote,
  saveTechnicalEmployeeNote,
  setTechnicalFeedbackAccess,
} from "@/lib/technical-reviews.functions";
import { formatScore, scoreLabel } from "@/lib/technical-review-catalog";

export const Route = createFileRoute("/_authenticated/avaliacoes/")({
  head: () => ({
    meta: [
      { title: "Avaliação Técnica Interna — CheckTecnico" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Módulo privado de avaliação técnica e feedback com apoio de IA.",
      },
    ],
  }),
  component: AvaliacoesPage,
});

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function AvaliacoesPage() {
  const access = useQuery({
    queryKey: ["technical-feedback-access"],
    queryFn: () => getTechnicalFeedbackAccess(),
  });

  if (access.isLoading) {
    return <div className="webi-page min-h-screen p-6 text-slate-400">Carregando…</div>;
  }

  if (!access.data?.hasAccess) {
    return (
      <div className="webi-page min-h-screen p-6">
        <Card className="mx-auto max-w-lg">
          <CardContent className="space-y-3 p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-400" />
            <h1 className="text-lg font-semibold text-white">Módulo privado</h1>
            <p className="text-sm text-slate-400">
              Este módulo é restrito. Solicite liberação ao administrador do provedor.
            </p>
            <Button asChild variant="secondary">
              <Link to="/painel">Voltar ao painel</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AvaliacoesContent canManage={Boolean(access.data.canManage)} />;
}

function AvaliacoesContent({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [periodStart, setPeriodStart] = useState(firstDayOfMonth());
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));

  const reviews = useQuery({
    queryKey: ["technical-reviews"],
    queryFn: () => listTechnicalReviews(),
  });
  const employees = useQuery({
    queryKey: ["technical-review-employees"],
    queryFn: () => listEvaluableEmployees(),
  });

  const create = useMutation({
    mutationFn: () => createTechnicalReview({ data: { employeeId, periodStart, periodEnd } }),
    onSuccess: (res) => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["technical-reviews"] });
      navigate({ to: "/avaliacoes/$id", params: { id: res.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [showArchived, setShowArchived] = useState(false);
  const all = reviews.data ?? [];
  const list = useMemo(
    () => all.filter((r) => (showArchived ? Boolean(r.archived_at) : !r.archived_at)),
    [all, showArchived],
  );
  const stats = useMemo(() => {
    const done = list.filter((r) => r.status === "concluida");
    const scores = done.map((r) => r.final_score).filter((s): s is number => typeof s === "number");
    return {
      total: list.length,
      done: done.length,
      drafts: list.length - done.length,
      average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  }, [list]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="webi-page min-h-screen">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <Link to="/painel">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Painel
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Avaliação Técnica Interna</h1>
              <p className="text-xs uppercase tracking-[.2em] text-cyan-400">
                Uso privado da gestão
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/auditoria-checklists">
                <ScanSearch className="mr-1.5 h-4 w-4" /> Analisar checklists com IA
              </Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                <Plus className="mr-1.5 h-4 w-4" /> Nova avaliação
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova avaliação</DialogTitle>
                <DialogDescription>
                  Escolha o colaborador e o período que será avaliado.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Colaborador</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {(employees.data ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                          {e.city ? ` · ${e.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Início do período</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fim do período</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!employeeId || create.isPending}>
                  {create.isPending ? "Criando…" : "Criar avaliação"}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Avaliações" value={stats.total} />
          <StatCard label="Concluídas" value={stats.done} />
          <StatCard label="Rascunhos" value={stats.drafts} />
          <StatCard label="Média geral" value={formatScore(stats.average)} />
        </section>

        <MonthlyNotesCard employees={employees.data ?? []} />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {showArchived ? "Avaliações arquivadas" : "Avaliações ativas"}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Ver ativas" : "Ver arquivadas"}
            </Button>
          </div>
          {reviews.isLoading ? (
            <p className="text-sm text-slate-400">Carregando avaliações…</p>
          ) : list.length === 0 ? (
            <Card>
              <CardContent className="space-y-2 p-8 text-center">
                <UsersRound className="mx-auto h-8 w-8 text-cyan-400" />
                <p className="text-white">
                  {showArchived
                    ? "Nenhuma avaliação arquivada."
                    : "Nenhuma avaliação registrada ainda."}
                </p>
                <p className="text-sm text-slate-400">
                  Crie a primeira avaliação para começar o histórico de evolução.
                </p>
              </CardContent>
            </Card>
          ) : (
            list.map((r) => (
              <Link key={r.id} to="/avaliacoes/$id" params={{ id: r.id }} className="block">
                <Card className="webi-nav-card">
                  <CardContent className="flex flex-wrap items-center gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{r.employee_name}</p>
                      <p className="text-xs text-slate-400">
                        {r.period_start} a {r.period_end}
                        {r.employee_city ? ` · ${r.employee_city}` : ""}
                      </p>
                    </div>
                    {r.next_review_date && r.next_review_date < today ? (
                      <Badge variant="destructive">Follow-up vencido</Badge>
                    ) : null}
                    <Badge variant={r.status === "concluida" ? "default" : "secondary"}>
                      {r.status === "concluida" ? "Concluída" : "Rascunho"}
                    </Badge>

                    <div className="text-right">
                      <p className="text-xl font-bold text-white">{formatScore(r.final_score)}</p>
                      <p className="text-[11px] text-slate-400">{scoreLabel(r.final_score)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </section>

        {canManage ? <AccessManager /> : null}

        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Sparkles className="h-3.5 w-3.5" /> As análises de IA são apoio à decisão — a avaliação
          final é sempre do gestor.
        </p>
      </main>
    </div>
  );
}

const QUICK_NOTE_TYPES = [
  ["positivo", "Positivo"],
  ["atencao", "Atenção"],
  ["desenvolvimento", "Desenvolvimento"],
  ["destaque", "Destaque"],
  ["tecnico", "Técnico"],
  ["atendimento", "Atendimento"],
  ["comunicacao", "Comunicação"],
  ["operacional", "Operacional"],
] as const;

function MonthlyNotesCard({
  employees,
}: {
  employees: Array<{ id: string; full_name: string; city: string | null }>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<(typeof QUICK_NOTE_TYPES)[number][0]>("operacional");
  const [competence, setCompetence] = useState(new Date().toISOString().slice(0, 7));
  const notes = useQuery({
    queryKey: ["technical-monthly-notes", competence],
    queryFn: () => listMonthlyTechnicalEmployeeNotes({ data: { competence } }),
  });
  const create = useMutation({
    mutationFn: () =>
      saveTechnicalEmployeeNote({
        data: {
          employeeId,
          occurredAt:
            competence === new Date().toISOString().slice(0, 7)
              ? new Date().toISOString()
              : `${competence}-01T12:00:00`,
          noteText,
          noteType,
          status: "rascunho",
        },
      }),
    onSuccess: () => {
      setNoteText("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["technical-monthly-notes", competence] });
      toast.success("Anotação privada registrada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const analyze = useMutation({
    mutationFn: (noteId: string) => analyzeTechnicalEmployeeNote({ data: { noteId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technical-monthly-notes", competence] });
      toast.success("Sugestão da IA preparada para revisão.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <NotebookPen className="h-4 w-4 text-cyan-400" /> Anotações do mês
            </h2>
            <p className="text-xs text-slate-400">
              Registre durante o mês, antes mesmo de iniciar a avaliação. Somente você vê.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              className="w-40"
              type="month"
              value={competence}
              onChange={(event) => setCompetence(event.target.value)}
            />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" /> Nova anotação
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova anotação privada</DialogTitle>
                  <DialogDescription>
                    Salva inicialmente como rascunho e não entra como fato na IA.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.full_name}
                          {employee.city ? ` · ${employee.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={noteType}
                    onValueChange={(value) => setNoteType(value as typeof noteType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUICK_NOTE_TYPES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    rows={4}
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="O que aconteceu? Escreva de forma simples."
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={!employeeId || noteText.trim().length < 3 || create.isPending}
                    onClick={() => create.mutate()}
                  >
                    Salvar rascunho
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {notes.isLoading ? (
          <p className="text-sm text-slate-500">Carregando anotações…</p>
        ) : (notes.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma anotação nesta competência.</p>
        ) : (
          <div className="space-y-2">
            {(notes.data ?? []).slice(0, 8).map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/10 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{row.employee_name}</p>
                  <p className="line-clamp-2 text-sm text-slate-300">{row.note_text}</p>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="secondary">{row.status}</Badge>
                    <Badge variant="outline">{row.note_type}</Badge>
                  </div>
                  {row.ai_professional_text ? (
                    <p className="mt-2 text-xs text-cyan-300">
                      Sugestão da IA: {row.ai_professional_text}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={analyze.isPending}
                  onClick={() => analyze.mutate(row.id)}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> IA
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-gradient-to-br from-blue-950/70 to-slate-950/60">
      <CardContent className="p-4">
        <p className="text-2xl font-extrabold text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </CardContent>
    </Card>
  );
}

function AccessManager() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const allowed = useQuery({
    queryKey: ["technical-feedback-access-list"],
    queryFn: () => listTechnicalFeedbackAccess(),
  });
  const employees = useQuery({
    queryKey: ["technical-review-employees"],
    queryFn: () => listEvaluableEmployees(),
  });
  const mutate = useMutation({
    mutationFn: (input: { userId: string; allow: boolean }) =>
      setTechnicalFeedbackAccess({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technical-feedback-access-list"] });
      qc.invalidateQueries({ queryKey: ["technical-feedback-access"] });
      setUserId("");
      toast.success("Acesso atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-white">Quem enxerga este módulo</h2>
          <p className="text-xs text-slate-400">
            Somente os usuários liberados aqui veem o módulo. Cada gestor vê apenas as próprias
            avaliações.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Selecione o usuário" />
            </SelectTrigger>
            <SelectContent>
              {(employees.data ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!userId || mutate.isPending}
            onClick={() => mutate.mutate({ userId, allow: true })}
          >
            Liberar acesso
          </Button>
        </div>
        <div className="space-y-2">
          {(allowed.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{row.full_name}</p>
                <p className="truncate text-xs text-slate-500">{row.email}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-300 hover:bg-rose-500/10"
                onClick={() => mutate.mutate({ userId: row.user_id, allow: false })}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
