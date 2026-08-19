import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  CalendarCheck,
  Copy,
  FileDown,
  History,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addReviewEvidence,
  deleteReviewFollowup,
  deleteTechnicalReview,
  getEmployeeReviewHistory,
  getTechnicalReview,
  listReviewCandidateChecklists,
  removeReviewEvidence,
  runTechnicalReviewAi,
  saveReviewFollowup,
  saveReviewMeeting,
  saveTechnicalReview,
  setReviewArchived,
} from "@/lib/technical-reviews.functions";
import { downloadAvaliacaoPdf } from "@/components/avaliacao/avaliacao-pdf";
import { ContinuousReviewPanel } from "@/components/avaliacao/continuous-review-panel";
import {
  REVIEW_GROUPS,
  formatScore,
  groupAverage,
  overallScore,
  scoreLabel,
} from "@/lib/technical-review-catalog";

export const Route = createFileRoute("/_authenticated/avaliacoes/$id")({
  head: () => ({
    meta: [
      { title: "Avaliação do colaborador — CheckTecnico" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Avaliação técnica interna com notas por critério e apoio de IA.",
      },
    ],
  }),
  component: ReviewDetail,
});

const AI_LABELS: Record<string, string> = {
  gerencial: "Análise gerencial",
  solides: "Texto para o Sólides",
  conversa: "Roteiro de conversa",
  plano: "Plano de desenvolvimento",
  copiloto: "Copiloto do Supervisor",
  revisao: "Revisar avaliação com IA",
};

function ReviewDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["technical-review", id],
    queryFn: () => getTechnicalReview({ data: { id } }),
  });

  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [groupNotes, setGroupNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    employee_role: "",
    strengths_notes: "",
    development_notes: "",
    general_notes: "",
    development_goal: "",
    development_action: "",
    development_metric: "",
    development_due_date: "",
    next_review_date: "",
  });
  const [tom, setTom] = useState<"direto" | "equilibrado" | "acolhedor">("equilibrado");
  const draftKey = `technical-review-draft:${id}`;
  const draftRestored = useRef(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    if (hydrated.current) return;
    hydrated.current = true;
    const s: Record<string, number | null> = {};
    const n: Record<string, string> = {};
    for (const item of data.items) {
      s[item.item_key] = item.score ?? null;
      if (item.observation) n[item.item_key] = item.observation;
    }
    setScores(s);
    setItemNotes(n);
    const g: Record<string, string> = {};
    for (const group of REVIEW_GROUPS) g[group.category] = data.review[group.notesColumn] ?? "";
    setGroupNotes(g);
    setForm({
      employee_role: data.review.employee_role ?? "",
      strengths_notes: data.review.strengths_notes ?? "",
      development_notes: data.review.development_notes ?? "",
      general_notes: data.review.general_notes ?? "",
      development_goal: data.review.development_goal ?? "",
      development_action: data.review.development_action ?? "",
      development_metric: data.review.development_metric ?? "",
      development_due_date: data.review.development_due_date ?? "",
      next_review_date: data.review.next_review_date ?? "",
    });

    // Restaura o rascunho local (o que o usuário digitou e ainda não salvou).
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as {
          scores?: Record<string, number | null>;
          itemNotes?: Record<string, string>;
          groupNotes?: Record<string, string>;
          form?: Record<string, string>;
        };
        if (draft.scores) setScores((prev) => ({ ...prev, ...draft.scores }));
        if (draft.itemNotes) setItemNotes((prev) => ({ ...prev, ...draft.itemNotes }));
        if (draft.groupNotes) setGroupNotes((prev) => ({ ...prev, ...draft.groupNotes }));
        if (draft.form) setForm((prev) => ({ ...prev, ...(draft.form as typeof prev) }));
        draftRestored.current = true;
        toast.info("Rascunho local restaurado. Clique em salvar para gravar.");
      }
    } catch {
      /* rascunho inválido é ignorado */
    }
  }, [query.data, draftKey]);

  // Guarda tudo o que foi digitado no navegador, para nada se perder em erros ou recargas.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ scores, itemNotes, groupNotes, form }));
    } catch {
      /* armazenamento indisponível */
    }
  }, [draftKey, scores, itemNotes, groupNotes, form]);

  const finalScore = useMemo(() => overallScore(scores), [scores]);

  const save = useMutation({
    mutationFn: (status?: "rascunho" | "concluida") =>
      saveTechnicalReview({
        data: { id, scores, itemNotes, groupNotes, ...form, status },
      }),
    onSuccess: () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      toast.success("Avaliação salva.");
      qc.invalidateQueries({ queryKey: ["technical-review", id] });
      qc.invalidateQueries({ queryKey: ["technical-reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ai = useMutation({
    mutationFn: async (
      type: "gerencial" | "solides" | "conversa" | "plano" | "copiloto" | "revisao",
    ) => {
      // A IA lê os dados gravados: salva o que está na tela antes de analisar.
      await saveTechnicalReview({ data: { id, scores, itemNotes, groupNotes, ...form } });
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      return runTechnicalReviewAi({ data: { id, type, tom } });
    },
    onSuccess: () => {
      toast.success("Análise gerada.");
      qc.invalidateQueries({ queryKey: ["technical-review", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteTechnicalReview({ data: { id } }),
    onSuccess: () => {
      toast.success("Avaliação excluída.");
      qc.invalidateQueries({ queryKey: ["technical-reviews"] });
      navigate({ to: "/avaliacoes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => setReviewArchived({ data: { id, archived } }),
    onSuccess: () => {
      toast.success("Situação de arquivamento atualizada.");
      qc.invalidateQueries({ queryKey: ["technical-review", id] });
      qc.invalidateQueries({ queryKey: ["technical-reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [pdfBusy, setPdfBusy] = useState(false);
  async function exportPdf() {
    if (!query.data) return;
    setPdfBusy(true);
    try {
      await saveTechnicalReview({ data: { id, scores, itemNotes, groupNotes, ...form } });
      const fresh = await getTechnicalReview({ data: { id } });
      await downloadAvaliacaoPdf({
        review: fresh.review,
        employee: fresh.employee,
        evaluatorName: fresh.evaluatorName,
        scores,
        items: fresh.items,
        evidences: fresh.evidences,
        meeting: fresh.meeting,
        followups: fresh.followups,
        ai: fresh.ai,
        finalScore: overallScore(scores),
      });
      qc.invalidateQueries({ queryKey: ["technical-review", id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }

  if (query.isLoading) {
    return <div className="webi-page min-h-screen p-6 text-slate-400">Carregando avaliação…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="webi-page min-h-screen p-6">
        <Card className="mx-auto max-w-lg">
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-white">Não foi possível abrir esta avaliação.</p>
            <Button asChild variant="secondary">
              <Link to="/avaliacoes">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    review,
    employee,
    ai: aiHistory,
    evidences,
    meeting,
    followups,
    notes,
    pdiActions,
  } = query.data;

  return (
    <div className="webi-page min-h-screen pb-24">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <Link to="/avaliacoes">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{employee.full_name}</h1>
              <p className="text-xs text-slate-300">
                {review.period_start} a {review.period_end}
                {employee.city ? ` · ${employee.city}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={review.status === "concluida" ? "default" : "secondary"}>
              {review.status === "concluida" ? "Concluída" : "Rascunho"}
            </Badge>
            <div className="text-right">
              <p className="text-2xl font-extrabold">{formatScore(finalScore)}</p>
              <p className="text-[11px] text-slate-300">{scoreLabel(finalScore)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-6">
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Função no período</Label>
              <Input
                value={form.employee_role}
                onChange={(e) => setForm({ ...form, employee_role: e.target.value })}
                placeholder="Ex.: Técnico de campo pleno"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo do plano</Label>
              <Input
                type="date"
                value={form.development_due_date}
                onChange={(e) => setForm({ ...form, development_due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Próxima avaliação</Label>
              <Input
                type="date"
                value={form.next_review_date}
                onChange={(e) => setForm({ ...form, next_review_date: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {REVIEW_GROUPS.map((group) => {
          const avg = groupAverage(group, scores);
          return (
            <Card key={group.category}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-white">{group.title}</h2>
                    <p className="text-xs text-slate-400">
                      Peso {Math.round(group.weight * 100)}% · {scoreLabel(avg)}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-cyan-300">{formatScore(avg)}</p>
                </div>
                <Separator />
                <div className="space-y-4">
                  {group.items.map((item) => (
                    <div key={item.key} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-slate-200">{item.label}</p>
                        <div className="flex gap-1 overflow-x-auto">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Button
                              key={n}
                              type="button"
                              size="sm"
                              variant={scores[item.key] === n ? "default" : "secondary"}
                              onClick={() => setScores({ ...scores, [item.key]: n })}
                            >
                              {n}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant={scores[item.key] == null ? "default" : "secondary"}
                            onClick={() => setScores({ ...scores, [item.key]: null })}
                          >
                            N/A
                          </Button>
                        </div>
                      </div>
                      <Input
                        value={itemNotes[item.key] ?? ""}
                        onChange={(e) => setItemNotes({ ...itemNotes, [item.key]: e.target.value })}
                        placeholder="Observação factual (opcional)"
                      />
                    </div>
                  ))}
                </div>
                <Textarea
                  value={groupNotes[group.category] ?? ""}
                  onChange={(e) =>
                    setGroupNotes({ ...groupNotes, [group.category]: e.target.value })
                  }
                  placeholder={`Comentário geral sobre ${group.title.toLowerCase()}`}
                  rows={2}
                />
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Pontos fortes</Label>
              <Textarea
                rows={4}
                value={form.strengths_notes}
                onChange={(e) => setForm({ ...form, strengths_notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pontos de desenvolvimento</Label>
              <Textarea
                rows={4}
                value={form.development_notes}
                onChange={(e) => setForm({ ...form, development_notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações gerais</Label>
              <Textarea
                rows={3}
                value={form.general_notes}
                onChange={(e) => setForm({ ...form, general_notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Objetivo do plano</Label>
              <Input
                value={form.development_goal}
                onChange={(e) => setForm({ ...form, development_goal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ação combinada</Label>
              <Input
                value={form.development_action}
                onChange={(e) => setForm({ ...form, development_action: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Indicador de acompanhamento</Label>
              <Input
                value={form.development_metric}
                onChange={(e) => setForm({ ...form, development_metric: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <ContinuousReviewPanel
          reviewId={id}
          periodStart={review.period_start}
          notes={notes}
          pdiActions={pdiActions}
        />
        <EvidencesCard reviewId={id} evidences={evidences} />
        <MeetingCard reviewId={id} meeting={meeting} />
        <FollowupsCard reviewId={id} followups={followups} defaultGoal={form.development_goal} />
        <HistoryCard employeeId={review.employee_id} currentId={id} />

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <Sparkles className="h-4 w-4 text-cyan-400" /> Apoio de IA
              </h2>
              <Select value={tom} onValueChange={(v) => setTom(v as typeof tom)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direto">Tom direto</SelectItem>
                  <SelectItem value="equilibrado">Tom equilibrado</SelectItem>
                  <SelectItem value="acolhedor">Tom acolhedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-400">
              Salve a avaliação antes de gerar: a IA usa apenas os dados já registrados.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["gerencial", "solides", "conversa", "plano", "copiloto", "revisao"] as const).map(
                (type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="secondary"
                    disabled={ai.isPending}
                    onClick={() => ai.mutate(type)}
                  >
                    {ai.isPending && ai.variables === type ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    {AI_LABELS[type]}
                  </Button>
                ),
              )}
            </div>
            <div className="space-y-3">
              {aiHistory.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma análise gerada ainda.</p>
              ) : (
                aiHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-white/10 bg-slate-950/50 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                        {AI_LABELS[entry.analysis_type] ?? entry.analysis_type}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void navigator.clipboard.writeText(entry.content);
                          toast.success("Texto copiado.");
                        }}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-200">{entry.content}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.model}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="text-rose-300 hover:bg-rose-500/10"
            onClick={() => {
              if (confirm("Excluir esta avaliação?")) remove.mutate();
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Excluir
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pdfBusy} onClick={() => void exportPdf()}>
              {pdfBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-1.5 h-4 w-4" />
              )}
              Baixar PDF
            </Button>
            <Button
              variant="secondary"
              disabled={archive.isPending}
              onClick={() => archive.mutate(!review.archived_at)}
            >
              <Archive className="mr-1.5 h-4 w-4" />
              {review.archived_at ? "Desarquivar" : "Arquivar"}
            </Button>
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => save.mutate(undefined)}
            >
              <Save className="mr-1.5 h-4 w-4" /> Salvar rascunho
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate("concluida")}>
              Concluir avaliação
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const EVIDENCE_TYPES = [
  { value: "checklist", label: "Checklist" },
  { value: "reclamacao", label: "Reclamação" },
  { value: "retrabalho", label: "Retrabalho" },
  { value: "elogio", label: "Elogio" },
  { value: "outro", label: "Outro" },
];

function EvidencesCard({ reviewId, evidences }: { reviewId: string; evidences: any[] }) {
  const qc = useQueryClient();
  const [type, setType] = useState("checklist");
  const [checklistId, setChecklistId] = useState("");
  const [description, setDescription] = useState("");

  const candidates = useQuery({
    queryKey: ["review-candidate-checklists", reviewId],
    queryFn: () => listReviewCandidateChecklists({ data: { id: reviewId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["technical-review", reviewId] });

  const add = useMutation({
    mutationFn: () => {
      const picked = (candidates.data ?? []).find((c) => c.id === checklistId);
      return addReviewEvidence({
        data: {
          id: reviewId,
          evidenceType: type,
          checklistId: checklistId || null,
          os: picked?.os ?? null,
          description: description || picked?.codigo || null,
        },
      });
    },
    onSuccess: () => {
      setChecklistId("");
      setDescription("");
      refresh();
      toast.success("Evidência registrada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (evidenceId: string) => removeReviewEvidence({ data: { evidenceId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Link2 className="h-4 w-4 text-cyan-400" /> Evidências
          </h2>
          <p className="text-xs text-slate-400">
            Vincule fatos reais do período avaliado. Elas também entram no contexto da IA.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVIDENCE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={checklistId} onValueChange={setChecklistId}>
            <SelectTrigger className="sm:col-span-1">
              <SelectValue
                placeholder={candidates.isLoading ? "Carregando…" : "Checklist do período"}
              />
            </SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {(c.codigo || c.os || c.id.slice(0, 8)) +
                    (c.cliente ? ` · ${c.cliente}` : "") +
                    ` · ${c.tipo}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="sm:col-span-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição do fato observado"
          />
        </div>
        <Button size="sm" disabled={add.isPending} onClick={() => add.mutate()}>
          <Plus className="mr-1.5 h-4 w-4" /> Adicionar evidência
        </Button>
        <div className="space-y-2">
          {evidences.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma evidência registrada.</p>
          ) : (
            evidences.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">
                    {e.description || "(sem descrição)"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.evidence_type}
                    {e.os ? ` · OS ${e.os}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-300 hover:bg-rose-500/10"
                  onClick={() => del.mutate(e.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MeetingCard({ reviewId, meeting }: { reviewId: string; meeting: any | null }) {
  const qc = useQueryClient();
  const [state, setState] = useState({
    meetingDate: meeting?.meeting_date
      ? new Date(meeting.meeting_date).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    meetingPlace: meeting?.meeting_place ?? "",
    employeeReaction: meeting?.employee_reaction ?? "",
    employeeComments: meeting?.employee_comments ?? "",
    supervisorNotes: meeting?.supervisor_notes ?? "",
    newInformationPresented: Boolean(meeting?.new_information_presented),
    newInformation: meeting?.new_information ?? "",
    feedbackRealized: Boolean(meeting?.feedback_realized),
    agreementStatus: meeting?.agreement_status ?? "",
    agreedActions: meeting?.agreed_actions ?? "",
    nextReviewDate: meeting?.next_review_date ?? "",
  });

  const save = useMutation({
    mutationFn: () => saveReviewMeeting({ data: { id: reviewId, ...state } }),
    onSuccess: () => {
      toast.success("Conversa registrada.");
      qc.invalidateQueries({ queryKey: ["technical-review", reviewId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <MessageSquare className="h-4 w-4 text-cyan-400" /> Conversa de feedback
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={state.meetingDate}
              onChange={(e) => setState({ ...state, meetingDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input
              value={state.meetingPlace}
              onChange={(e) => setState({ ...state, meetingPlace: e.target.value })}
              placeholder="Ex.: base operacional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reação do colaborador</Label>
            <Select
              value={state.employeeReaction || "nao_informado"}
              onValueChange={(v) =>
                setState({ ...state, employeeReaction: v === "nao_informado" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informado">Não informado</SelectItem>
                <SelectItem value="receptivo">Receptivo</SelectItem>
                <SelectItem value="neutro">Neutro</SelectItem>
                <SelectItem value="defensivo">Defensivo</SelectItem>
                <SelectItem value="discordou">Discordou</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
            <Switch
              checked={state.feedbackRealized}
              onCheckedChange={(value) => setState({ ...state, feedbackRealized: value })}
            />
            <Label className="text-sm text-slate-300">Feedback realizado</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Posicionamento do colaborador</Label>
            <Select
              value={state.agreementStatus || "nao_informado"}
              onValueChange={(value) =>
                setState({
                  ...state,
                  agreementStatus: value === "nao_informado" ? "" : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informado">Não informado</SelectItem>
                <SelectItem value="concordou">Concordou</SelectItem>
                <SelectItem value="concordou_parcialmente">Concordou parcialmente</SelectItem>
                <SelectItem value="discordou">Discordou</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Próxima avaliação</Label>
            <Input
              type="date"
              value={state.nextReviewDate}
              onChange={(e) => setState({ ...state, nextReviewDate: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Comentários do colaborador</Label>
            <Textarea
              rows={3}
              value={state.employeeComments}
              onChange={(e) => setState({ ...state, employeeComments: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notas do gestor</Label>
            <Textarea
              rows={3}
              value={state.supervisorNotes}
              onChange={(e) => setState({ ...state, supervisorNotes: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ações/PDI acordados</Label>
          <Textarea
            rows={2}
            value={state.agreedActions}
            onChange={(e) => setState({ ...state, agreedActions: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={state.newInformationPresented}
            onCheckedChange={(v) => setState({ ...state, newInformationPresented: v })}
          />
          <Label className="text-sm text-slate-300">O colaborador apresentou informação nova</Label>
        </div>
        {state.newInformationPresented ? (
          <Textarea
            rows={2}
            value={state.newInformation}
            onChange={(e) => setState({ ...state, newInformation: e.target.value })}
            placeholder="O que foi apresentado e o que muda na avaliação"
          />
        ) : null}
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          <Save className="mr-1.5 h-4 w-4" /> Salvar conversa
        </Button>
      </CardContent>
    </Card>
  );
}

const FOLLOWUP_STATUS = [
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "atingido", label: "Atingido" },
  { value: "nao_atingido", label: "Não atingido" },
];

function FollowupsCard({
  reviewId,
  followups,
  defaultGoal,
}: {
  reviewId: string;
  followups: any[];
  defaultGoal: string;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("pendente");
  const [result, setResult] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["technical-review", reviewId] });

  const add = useMutation({
    mutationFn: () =>
      saveReviewFollowup({
        data: {
          id: reviewId,
          followupDate: date,
          status,
          previousGoal: defaultGoal || null,
          result: result || null,
        },
      }),
    onSuccess: () => {
      setResult("");
      refresh();
      toast.success("Acompanhamento registrado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (input: { followupId: string; followupDate: string; status: string }) =>
      saveReviewFollowup({ data: { id: reviewId, ...input } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (followupId: string) => deleteReviewFollowup({ data: { followupId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <CalendarCheck className="h-4 w-4 text-cyan-400" /> Acompanhamento do plano
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOLLOWUP_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="sm:col-span-2"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="Resultado / observação"
          />
        </div>
        <Button size="sm" disabled={add.isPending} onClick={() => add.mutate()}>
          <Plus className="mr-1.5 h-4 w-4" /> Adicionar acompanhamento
        </Button>
        <div className="space-y-2">
          {followups.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum acompanhamento registrado.</p>
          ) : (
            followups.map((f) => {
              const overdue = f.status === "pendente" && f.followup_date < today;
              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      {f.followup_date}
                      {overdue ? (
                        <Badge variant="destructive" className="ml-2">
                          Vencido
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {f.result || f.observation || f.previous_goal || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={f.status}
                      onValueChange={(v) =>
                        update.mutate({
                          followupId: f.id,
                          followupDate: f.followup_date,
                          status: v,
                        })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLLOWUP_STATUS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-300 hover:bg-rose-500/10"
                      onClick={() => del.mutate(f.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ employeeId, currentId }: { employeeId: string; currentId: string }) {
  const history = useQuery({
    queryKey: ["employee-review-history", employeeId],
    queryFn: () => getEmployeeReviewHistory({ data: { employeeId } }),
  });

  const rows = history.data ?? [];
  const current = rows.find((r) => r.id === currentId);
  const previous = rows.filter((r) => r.id !== currentId)[0];

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <History className="h-4 w-4 text-cyan-400" /> Histórico e evolução
        </h2>
        {history.isLoading ? (
          <p className="text-sm text-slate-400">Carregando histórico…</p>
        ) : rows.length <= 1 ? (
          <p className="text-sm text-slate-500">
            Esta é a primeira avaliação registrada para o colaborador.
          </p>
        ) : (
          <>
            {previous && current ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Comparativo com {previous.period_start} a {previous.period_end}
                </p>
                {REVIEW_GROUPS.map((g) => {
                  const now = current[g.scoreColumn] as number | null;
                  const before = previous[g.scoreColumn] as number | null;
                  const delta =
                    typeof now === "number" && typeof before === "number" ? now - before : null;
                  return (
                    <div
                      key={g.category}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-slate-300">{g.title}</span>
                      <span className="text-slate-400">
                        {formatScore(before)} → {formatScore(now)}
                        <span
                          className={
                            delta == null
                              ? " text-slate-500"
                              : delta > 0.05
                                ? " text-emerald-400"
                                : delta < -0.05
                                  ? " text-rose-400"
                                  : " text-slate-400"
                          }
                        >
                          {delta == null
                            ? " · —"
                            : delta > 0.05
                              ? ` · +${delta.toFixed(1)}`
                              : delta < -0.05
                                ? ` · ${delta.toFixed(1)}`
                                : " · estável"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <Separator />
            <div className="space-y-2">
              {rows.map((r) => (
                <Link
                  key={r.id}
                  to="/avaliacoes/$id"
                  params={{ id: r.id }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-sm"
                >
                  <span className="text-slate-300">
                    {r.period_start} a {r.period_end}
                    {r.id === currentId ? " (atual)" : ""}
                  </span>
                  <span className="font-semibold text-white">{formatScore(r.final_score)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
