import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, Save, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteTechnicalReview,
  getTechnicalReview,
  runTechnicalReviewAi,
  saveTechnicalReview,
} from "@/lib/technical-reviews.functions";
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
    mutationFn: (type: "gerencial" | "solides" | "conversa" | "plano") =>
      runTechnicalReviewAi({ data: { id, type, tom } }),
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

  const { review, employee, ai: aiHistory } = query.data;

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
                        onChange={(e) =>
                          setItemNotes({ ...itemNotes, [item.key]: e.target.value })
                        }
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
              {(["gerencial", "solides", "conversa", "plano"] as const).map((type) => (
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
              ))}
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
          <div className="flex gap-2">
            <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>
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
