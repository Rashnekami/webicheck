import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  Info,
  Loader2,
  Pause,
  Play,
  ScanSearch,
  ThumbsUp,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEvaluableEmployees } from "@/lib/technical-reviews.functions";
import {
  listChecklistFindings,
  previewChecklistAudit,
  reviewChecklistFinding,
  runChecklistAuditBatch,
  startChecklistAudit,
} from "@/lib/checklist-audit.functions";
import { FINDING_KIND_LABEL, RUBRIC_VALID_FROM, RUBRIC_VERSION } from "@/lib/checklist-audit";

export const Route = createFileRoute("/_authenticated/auditoria-checklists")({
  head: () => ({
    meta: [
      { title: "Auditoria de checklists por IA — CheckTecnico" },
      {
        name: "description",
        content:
          "Auditoria assistida dos checklists executados por um técnico, com apontamentos revisados pelo supervisor.",
      },
    ],
  }),
  component: AuditoriaChecklists,
});

const TIPO_LABEL: Record<string, string> = {
  validacao_ont: "Validação de ONT",
  instalacao: "Instalação",
  remapeamento_cto: "Remapeamento de CTO",
  rompimento: "Rompimento",
  readequacao: "Readequação",
  melhoria_sinal: "Melhoria de sinal",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function AuditoriaChecklists() {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [batchId, setBatchId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const pausedRef = useRef(false);

  const employees = useQuery({
    queryKey: ["evaluable-employees"],
    queryFn: () => listEvaluableEmployees(),
  });

  const filters = { employeeId, dateFrom, dateTo };

  const preview = useMutation({
    mutationFn: () => previewChecklistAudit({ data: filters }),
    onError: (e: Error) => toast.error(e.message),
  });

  const findings = useQuery({
    queryKey: ["checklist-findings", employeeId],
    queryFn: () => listChecklistFindings({ data: { employeeId } }),
    enabled: Boolean(employeeId),
  });

  /**
   * O lote roda em rodadas curtas: cada chamada processa alguns checklists e
   * devolve quanto falta. Pausar é parar de pedir a próxima rodada — por isso
   * não é preciso fila nem agendamento no servidor.
   */
  async function runLoop(id: string, total: number) {
    setRunning(true);
    pausedRef.current = false;
    let guard = 0;
    try {
      while (!pausedRef.current && guard < 400) {
        guard++;
        const res = await runChecklistAuditBatch({ data: { batchId: id } });
        const processed = res.batch?.processed ?? 0;
        setProgress({ done: processed, total });
        if (res.done) {
          toast.success("Auditoria concluída.");
          break;
        }
      }
      if (pausedRef.current) toast.message("Auditoria pausada. Você pode continuar depois.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["checklist-findings", employeeId] });
    }
  }

  const start = useMutation({
    mutationFn: () => startChecklistAudit({ data: filters }),
    onSuccess: (batch: any) => {
      setBatchId(batch.id);
      setProgress({ done: 0, total: batch.total_checklists ?? 0 });
      void runLoop(batch.id, batch.total_checklists ?? 0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = useMutation({
    mutationFn: (v: {
      findingId: string;
      reviewStatus: "confirmado" | "rejeitado" | "nao_era_responsabilidade";
      supervisorNote?: string;
    }) => reviewChecklistFinding({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-findings", employeeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checklistById = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of findings.data?.checklists ?? []) map.set(c.id, c);
    return map;
  }, [findings.data]);

  const analysisById = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of findings.data?.analyses ?? []) map.set(a.id, a);
    return map;
  }, [findings.data]);

  const grouped = useMemo(() => {
    const rows = findings.data?.findings ?? [];
    const byChecklist = new Map<string, any[]>();
    for (const f of rows) {
      const analysis = analysisById.get(f.analysis_id);
      if (!analysis) continue;
      const list = byChecklist.get(analysis.checklist_id) ?? [];
      list.push(f);
      byChecklist.set(analysis.checklist_id, list);
    }
    return [...byChecklist.entries()];
  }, [findings.data, analysisById]);

  const resumo = useMemo(() => {
    const rows = findings.data?.findings ?? [];
    return {
      positivos: rows.filter((f: any) => f.kind === "ponto_positivo").length,
      atencao: rows.filter((f: any) => f.kind === "ponto_atencao").length,
      inconsistencias: rows.filter((f: any) => f.kind === "inconsistencia").length,
      revisao: rows.filter((f: any) => f.kind === "revisao_humana").length,
      pendentes: rows.filter((f: any) => f.review_status === "pendente").length,
    };
  }, [findings.data]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link to="/avaliacoes">
            <ArrowLeft className="mr-2 h-4 w-4" /> Avaliações
          </Link>
        </Button>
        <Badge variant="outline" className="gap-1">
          <Info className="h-3 w-3" /> Rubrica {RUBRIC_VERSION}
        </Badge>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria de checklists por IA</h1>
        <p className="text-sm text-muted-foreground">
          Lê os checklists finalizados do técnico e levanta fatos verificáveis para a conversa de
          feedback. Nada aqui vira nota: cada apontamento só conta depois que você confirma.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Selecione o período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Técnico</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o técnico" />
                </SelectTrigger>
                <SelectContent>
                  {(employees.data ?? []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            A rubrica vigente vale a partir de {RUBRIC_VALID_FROM}. Checklists finalizados antes
            dessa data não são auditados — o formulário ainda mudava, e apontar campo que não
            existia na época seria injusto com o técnico.
          </p>

          <Button
            onClick={() => preview.mutate()}
            disabled={!employeeId || preview.isPending}
            variant="secondary"
          >
            {preview.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="mr-2 h-4 w-4" />
            )}
            Conferir antes de processar
          </Button>
        </CardContent>
      </Card>

      {preview.data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Prévia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Checklists no período" value={preview.data.total} />
              <Stat label="Já analisados" value={preview.data.jaAnalisados} />
              <Stat label="A processar" value={preview.data.pendentes} />
              <Stat
                label="Estimativa"
                value={`~${Math.ceil(preview.data.estimativaSegundos / 60)} min`}
              />
            </div>

            {preview.data.truncatedTo && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                O período pedido começa antes da vigência da rubrica. A auditoria vai considerar
                apenas de {preview.data.truncatedTo} em diante.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.data.porTipo ?? {}).map(([tipo, qtd]) => (
                <Badge key={tipo} variant="secondary">
                  {TIPO_LABEL[tipo] ?? tipo}: {qtd as number}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => start.mutate()}
                disabled={running || preview.data.pendentes === 0}
              >
                {running ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Iniciar auditoria
              </Button>
              {running && (
                <Button
                  variant="outline"
                  onClick={() => {
                    pausedRef.current = true;
                  }}
                >
                  <Pause className="mr-2 h-4 w-4" /> Pausar
                </Button>
              )}
              {!running && batchId && progress && progress.done < progress.total && (
                <Button variant="outline" onClick={() => void runLoop(batchId, progress.total)}>
                  <Play className="mr-2 h-4 w-4" /> Continuar
                </Button>
              )}
            </div>

            {progress && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {progress.done} de {progress.total} processados
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {employeeId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Apontamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {findings.isLoading && (
              <p className="text-sm text-muted-foreground">Carregando apontamentos…</p>
            )}
            {findings.isError && (
              <p className="text-sm text-destructive">
                Não foi possível carregar: {(findings.error as Error).message}
              </p>
            )}
            {!findings.isLoading && grouped.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum checklist auditado ainda para este técnico. Rode a auditoria acima.
              </p>
            )}

            {grouped.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="gap-1">
                  <ThumbsUp className="h-3 w-3" /> {resumo.positivos} positivos
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <TriangleAlert className="h-3 w-3" /> {resumo.atencao} de atenção
                </Badge>
                <Badge variant="secondary">{resumo.inconsistencias} inconsistências</Badge>
                <Badge variant="outline">{resumo.pendentes} pendentes de revisão</Badge>
              </div>
            )}

            {grouped.map(([checklistId, rows]) => {
              const c = checklistById.get(checklistId);
              const codigo = c?.rmap_code || c?.intervention_code || c?.numero_publico || "—";
              return (
                <div key={checklistId} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {TIPO_LABEL[c?.tipo] ?? c?.tipo} · {c?.cliente || codigo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {codigo} · {c?.cidade ?? "—"} ·{" "}
                        {c?.finalizado_em ? String(c.finalizado_em).slice(0, 10) : "—"}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/checklists/$id" params={{ id: checklistId }}>
                        Abrir checklist <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {rows.map((f: any) => (
                      <FindingRow key={f.id} finding={f} onReview={review.mutate} />
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function FindingRow({
  finding,
  onReview,
}: {
  finding: any;
  onReview: (v: {
    findingId: string;
    reviewStatus: "confirmado" | "rejeitado" | "nao_era_responsabilidade";
    supervisorNote?: string;
  }) => void;
}) {
  const [note, setNote] = useState(finding.supervisor_note ?? "");
  const [open, setOpen] = useState(false);

  const tone =
    finding.kind === "ponto_positivo"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : finding.kind === "inconsistencia"
        ? "border-red-500/40 bg-red-500/5"
        : finding.kind === "revisao_humana"
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border";

  const decided = finding.review_status !== "pendente";

  return (
    <div className={`rounded-md border p-2.5 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {FINDING_KIND_LABEL[finding.kind as keyof typeof FINDING_KIND_LABEL] ?? finding.kind}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {finding.origin === "regra" ? "verificado por regra" : "leitura por IA"}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              confiança {finding.confidence}
            </span>
            {decided && (
              <Badge className="text-[10px]">
                {finding.review_status === "confirmado"
                  ? "confirmado"
                  : finding.review_status === "rejeitado"
                    ? "rejeitado"
                    : "não era responsabilidade do técnico"}
              </Badge>
            )}
          </div>
          <p className="text-sm">{finding.description}</p>
          {finding.supervisor_note && (
            <p className="mt-1 text-xs text-muted-foreground">
              Sua observação: {finding.supervisor_note}
            </p>
          )}
        </div>
      </div>

      {!decided && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              onReview({ findingId: finding.id, reviewStatus: "confirmado", supervisorNote: note })
            }
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirmar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onReview({ findingId: finding.id, reviewStatus: "rejeitado", supervisorNote: note })
            }
          >
            <CircleSlash className="mr-1.5 h-3.5 w-3.5" /> Rejeitar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onReview({
                findingId: finding.id,
                reviewStatus: "nao_era_responsabilidade",
                supervisorNote: note,
              })
            }
          >
            <UserRound className="mr-1.5 h-3.5 w-3.5" /> Não era dele
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            Contexto
          </Button>
        </div>
      )}

      {open && !decided && (
        <Textarea
          className="mt-2 text-sm"
          rows={2}
          placeholder="O que você sabe sobre esse caso que o sistema não sabe?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
    </div>
  );
}
