import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, CalendarCheck, Check, NotebookPen, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeTechnicalEmployeeNote,
  deleteTechnicalEmployeeNote,
  deleteTechnicalPdiAction,
  saveTechnicalEmployeeNote,
  saveTechnicalPdiAction,
} from "@/lib/technical-reviews.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */

const NOTE_TYPES = [
  ["positivo", "Positivo"],
  ["atencao", "Atenção"],
  ["desenvolvimento", "Desenvolvimento"],
  ["destaque", "Destaque"],
  ["tecnico", "Técnico"],
  ["atendimento", "Atendimento"],
  ["comunicacao", "Comunicação"],
  ["operacional", "Operacional"],
] as const;

const NOTE_STATUS = [
  ["rascunho", "Rascunho"],
  ["confirmada", "Confirmada"],
  ["utilizada", "Utilizada na avaliação"],
  ["arquivada", "Arquivada"],
] as const;

const PDI_STATUS = [
  ["nao_iniciado", "Não iniciado"],
  ["em_andamento", "Em andamento"],
  ["cumprido", "Cumprido"],
  ["parcialmente_cumprido", "Parcialmente cumprido"],
  ["nao_cumprido", "Não cumprido"],
  ["cancelado", "Cancelado"],
] as const;

function monthLabel(competence: string) {
  if (!/^\d{4}-\d{2}$/.test(competence)) return competence;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(`${competence}-02T12:00:00`),
  );
}

export function ContinuousReviewPanel({
  reviewId,
  periodStart,
  notes,
  pdiActions,
}: {
  reviewId: string;
  periodStart: string;
  notes: any[];
  pdiActions: any[];
}) {
  const qc = useQueryClient();
  const competence = periodStart.slice(0, 7);
  const refresh = () => qc.invalidateQueries({ queryKey: ["technical-review", reviewId] });

  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number][0]>("operacional");
  const [category, setCategory] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));

  const addNote = useMutation({
    mutationFn: () =>
      saveTechnicalEmployeeNote({
        data: {
          reviewId,
          occurredAt,
          noteText: note,
          noteType,
          category: category || null,
          status: "rascunho",
        },
      }),
    onSuccess: () => {
      setNote("");
      setCategory("");
      refresh();
      toast.success("Anotação privada salva como rascunho.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateNote = useMutation({
    mutationFn: (input: {
      row: any;
      status?: (typeof NOTE_STATUS)[number][0];
      acceptAi?: boolean;
    }) => {
      const { row, status, acceptAi } = input;
      return saveTechnicalEmployeeNote({
        data: {
          reviewId,
          noteId: row.id,
          occurredAt: row.occurred_at,
          noteText: acceptAi && row.ai_professional_text ? row.ai_professional_text : row.note_text,
          noteType: (acceptAi && row.ai_suggested_type
            ? row.ai_suggested_type
            : row.note_type) as (typeof NOTE_TYPES)[number][0],
          category: acceptAi ? row.ai_suggested_category : row.category,
          status: status ?? row.status,
          checklistId: row.checklist_id,
          serviceOrder: row.service_order,
        },
      });
    },
    onSuccess: () => {
      refresh();
      toast.success("Anotação atualizada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const analyze = useMutation({
    mutationFn: (noteId: string) => analyzeTechnicalEmployeeNote({ data: { noteId } }),
    onSuccess: () => {
      refresh();
      toast.success("Sugestão da IA gerada para sua revisão.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeNote = useMutation({
    mutationFn: (noteId: string) => deleteTechnicalEmployeeNote({ data: { noteId } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmed = notes.filter((n) => n.status === "confirmada" || n.status === "utilizada");
  const noteSummary = useMemo(() => {
    const byType = Object.fromEntries(NOTE_TYPES.map(([value]) => [value, 0])) as Record<
      string,
      number
    >;
    const skills = new Map<string, number>();
    for (const row of confirmed) {
      byType[row.note_type] = (byType[row.note_type] ?? 0) + 1;
      const terms = Array.isArray(row.ai_suggested_competencies)
        ? row.ai_suggested_competencies
        : row.category
          ? [row.category]
          : [];
      for (const term of terms) skills.set(String(term), (skills.get(String(term)) ?? 0) + 1);
    }
    return {
      byType,
      skills: [...skills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [confirmed]);

  const [pdi, setPdi] = useState({
    objective: "",
    agreedAction: "",
    indicator: "",
    dueDate: "",
    managementSupport: "",
  });

  const savePdi = useMutation({
    mutationFn: (input?: { row?: any; status?: string }) => {
      const row = input?.row;
      return saveTechnicalPdiAction({
        data: row
          ? {
              reviewId,
              actionId: row.id,
              objective: row.objective,
              agreedAction: row.agreed_action,
              indicator: row.indicator,
              dueDate: row.due_date,
              managementSupport: row.management_support,
              followupComment: row.followup_comment,
              status: input?.status as any,
              source: row.source,
            }
          : { reviewId, ...pdi, status: "nao_iniciado" },
      });
    },
    onSuccess: () => {
      setPdi({
        objective: "",
        agreedAction: "",
        indicator: "",
        dueDate: "",
        managementSupport: "",
      });
      refresh();
      toast.success("Ação do PDI salva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removePdi = useMutation({
    mutationFn: (actionId: string) => deleteTechnicalPdiAction({ data: { actionId } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <NotebookPen className="h-4 w-4 text-cyan-400" /> Acompanhamento contínuo
          </h2>
          <p className="text-xs text-slate-400">
            Registros privados de {monthLabel(competence)}. Somente o autor pode acessá-los.
          </p>
        </div>

        <Tabs defaultValue="visao">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="visao">Visão geral</TabsTrigger>
            <TabsTrigger value="anotacoes">Anotações</TabsTrigger>
            <TabsTrigger value="pdi">PDI</TabsTrigger>
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
          </TabsList>

          <TabsContent value="visao" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Summary label="Registros" value={notes.length} />
              <Summary
                label="Positivos/destaques"
                value={noteSummary.byType.positivo + noteSummary.byType.destaque}
              />
              <Summary label="Desenvolvimento" value={noteSummary.byType.desenvolvimento} />
              <Summary
                label="Em rascunho"
                value={notes.filter((n) => n.status === "rascunho").length}
              />
            </div>
            <p className="text-xs text-amber-300">
              A quantidade de anotações é contexto, não nota. A avaliação permanece decisão do
              supervisor.
            </p>
            {noteSummary.skills.length ? (
              <div className="flex flex-wrap gap-2">
                {noteSummary.skills.map(([skill, total]) => (
                  <Badge key={skill} variant="secondary">
                    {skill} · {total}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Confirme registros e use a IA para organizar competências recorrentes.
              </p>
            )}
          </TabsContent>

          <TabsContent value="anotacoes" className="space-y-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input
                className="sm:col-span-2"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
              <Select
                value={noteType}
                onValueChange={(value) => setNoteType(value as typeof noteType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Categoria (opcional)"
              />
              <Textarea
                className="sm:col-span-4"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Escreva rapidamente o que aconteceu. Você poderá revisar e confirmar depois."
              />
            </div>
            <Button
              size="sm"
              disabled={addNote.isPending || note.trim().length < 3}
              onClick={() => addNote.mutate()}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Nova anotação
            </Button>
            <div className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma anotação nesta competência.</p>
              ) : (
                notes.map((row) => (
                  <div
                    key={row.id}
                    className="space-y-3 rounded-lg border border-white/10 bg-slate-950/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {NOTE_TYPES.find(([v]) => v === row.note_type)?.[1] ?? row.note_type}
                          </Badge>
                          {row.category ? <Badge variant="outline">{row.category}</Badge> : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-200">
                          {row.note_text}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {new Date(row.occurred_at).toLocaleString("pt-BR")} · {row.competence}
                        </p>
                      </div>
                      <Select
                        value={row.status}
                        onValueChange={(status) =>
                          updateNote.mutate({ row, status: status as any })
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTE_STATUS.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {row.ai_professional_text ? (
                      <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-slate-300">
                        <p className="mb-1 text-xs font-semibold text-cyan-300">
                          Sugestão da IA — revisar antes de utilizar.
                        </p>
                        <p>{row.ai_professional_text}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {(row.ai_suggested_competencies ?? []).join(" · ")}
                        </p>
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="secondary"
                          onClick={() => updateNote.mutate({ row, acceptAi: true })}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Aceitar e editar registro
                        </Button>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={analyze.isPending}
                        onClick={() => analyze.mutate(row.id)}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" /> Analisar com IA
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-300"
                        onClick={() => removeNote.mutate(row.id)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="pdi" className="space-y-4 pt-3">
            <p className="text-xs text-slate-400">
              Priorize de 1 a 3 objetivos mensuráveis; o limite excepcional é 4.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Objetivo">
                <Input
                  value={pdi.objective}
                  onChange={(e) => setPdi({ ...pdi, objective: e.target.value })}
                />
              </Field>
              <Field label="Ação combinada">
                <Input
                  value={pdi.agreedAction}
                  onChange={(e) => setPdi({ ...pdi, agreedAction: e.target.value })}
                />
              </Field>
              <Field label="Indicador">
                <Input
                  value={pdi.indicator}
                  onChange={(e) => setPdi({ ...pdi, indicator: e.target.value })}
                />
              </Field>
              <Field label="Prazo">
                <Input
                  type="date"
                  value={pdi.dueDate}
                  onChange={(e) => setPdi({ ...pdi, dueDate: e.target.value })}
                />
              </Field>
              <Field label="Apoio da gestão" className="sm:col-span-2">
                <Input
                  value={pdi.managementSupport}
                  onChange={(e) => setPdi({ ...pdi, managementSupport: e.target.value })}
                />
              </Field>
            </div>
            <Button
              size="sm"
              disabled={
                savePdi.isPending ||
                pdiActions.length >= 4 ||
                !pdi.objective.trim() ||
                !pdi.agreedAction.trim() ||
                !pdi.indicator.trim()
              }
              onClick={() => savePdi.mutate(undefined)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Adicionar ação
            </Button>
            <div className="space-y-3">
              {pdiActions.map((row, index) => (
                <div key={row.id} className="rounded-lg border border-white/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">
                        {index + 1}. {row.objective}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">{row.agreed_action}</p>
                      <p className="mt-1 text-xs text-cyan-300">Indicador: {row.indicator}</p>
                      {row.management_support ? (
                        <p className="mt-1 text-xs text-slate-400">
                          Apoio: {row.management_support}
                        </p>
                      ) : null}
                    </div>
                    <Select
                      value={row.status}
                      onValueChange={(status) => savePdi.mutate({ row, status })}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PDI_STATUS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{row.due_date ? `Prazo: ${row.due_date}` : "Sem prazo definido"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-300"
                      onClick={() => removePdi.mutate(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="evolucao" className="space-y-3 pt-3">
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <CalendarCheck className="h-4 w-4 text-cyan-400" /> O histórico mensal completo
              continua logo abaixo, comparando o colaborador apenas com ele mesmo.
            </p>
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <Brain className="h-4 w-4 text-cyan-400" /> Na próxima avaliação, as anotações
              confirmadas, o PDI e o período anterior entram no contexto da IA; ausência de dados
              não é tratada como piora.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
