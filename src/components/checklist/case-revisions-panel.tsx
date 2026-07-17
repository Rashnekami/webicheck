import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, FilePlus2, Loader2, RefreshCw, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ChecklistRow } from "@/lib/checklist-schema";
import {
  createChecklistRevision,
  getDiagnosticDownloadUrl,
  listCaseTimeline,
  listDiagnosticReports,
  revokeDiagnosticReport,
  type ServiceStage,
} from "@/lib/webi-diagnostic.functions";

const STAGE_LABELS: Record<ServiceStage, string> = {
  initial: "Atendimento inicial",
  pre_change: "Pré-troca",
  post_ont_change: "Pós-troca da ONT",
  noc_retest: "Reteste NOC",
  additional_test: "Teste adicional",
};

const TEST_STAGE_LABEL: Record<string, string> = {
  before_change: "Antes da troca",
  after_ont_change: "Depois da troca",
  noc_retest: "Reteste NOC",
  additional_test: "Adicional",
};

interface Props {
  row: ChecklistRow & {
    case_id?: string;
    revision_number?: number;
    is_current?: boolean;
    service_stage?: ServiceStage;
    superseded_by_checklist_id?: string | null;
    parent_checklist_id?: string | null;
  };
  isAdmin: boolean;
}

export function CaseRevisionsPanel({ row, isAdmin }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const caseId = row.case_id ?? row.id;

  const diagsQ = useQuery({
    queryKey: ["case-diagnostics", caseId],
    queryFn: () => listDiagnosticReports({ data: { caseId } }),
  });
  const timelineQ = useQuery({
    queryKey: ["case-timeline", caseId],
    queryFn: () => listCaseTimeline({ data: { caseId } }),
  });

  const [revOpen, setRevOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<ServiceStage>("post_ont_change");

  const createRev = useMutation({
    mutationFn: () =>
      createChecklistRevision({
        data: {
          checklistId: row.id,
          reason,
          notes,
          stage,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Revisão R${r.revision_number} criada.`);
      setRevOpen(false);
      setReason("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["checklist", r.id] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
      navigate({ to: "/checklists/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDiag = useMutation({
    mutationFn: (id: string) => getDiagnosticDownloadUrl({ data: { reportId: id } }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeDiag = useMutation({
    mutationFn: (id: string) => revokeDiagnosticReport({ data: { reportId: id } }),
    onSuccess: () => {
      toast.success("Diagnóstico revogado.");
      qc.invalidateQueries({ queryKey: ["case-diagnostics", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isFinalizado = row.status === "finalizado";

  return (
    <div className="space-y-4">
      {row.superseded_by_checklist_id && (
        <Card className="border-amber-400/50 bg-amber-50/50">
          <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
            <span className="text-amber-900">
              Esta é uma versão anterior — existe uma revisão mais recente deste
              atendimento.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate({
                  to: "/checklists/$id",
                  params: { id: row.superseded_by_checklist_id! },
                })
              }
            >
              Abrir versão atual
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Atendimento e revisões</h3>
              <p className="text-xs text-muted-foreground">
                Versão atual: R{row.revision_number ?? 1} ·{" "}
                {STAGE_LABELS[row.service_stage ?? "initial"]}
              </p>
            </div>
            {isFinalizado && row.is_current !== false && (
              <Button size="sm" onClick={() => setRevOpen(true)}>
                <FilePlus2 className="mr-1.5 h-4 w-4" /> Criar revisão
              </Button>
            )}
          </div>

          {timelineQ.data && timelineQ.data.length > 0 && (
            <ol className="space-y-1 text-xs">
              {timelineQ.data.map((t) => (
                <li key={`${t.kind}-${t.id}`} className="flex gap-2">
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {new Date(t.at).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex-1">
                    {t.kind === "revision" ? "🗂️" : "📄"} {t.label}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Diagnósticos Webi Diagnostic</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["case-diagnostics", caseId] })
              }
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
          {diagsQ.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
          {diagsQ.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum diagnóstico anexado. Use o Webi Diagnostic Agent para enviar
              o PDF automaticamente.
            </p>
          )}
          <div className="divide-y">
            {diagsQ.data?.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {d.original_filename}
                    </span>
                    <Badge variant="secondary">
                      {TEST_STAGE_LABEL[d.test_stage] ?? d.test_stage} #{d.report_sequence}
                    </Badge>
                    {d.status !== "active" && (
                      <Badge className="bg-amber-500/15 text-amber-800">
                        {d.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(d.created_at).toLocaleString("pt-BR")} ·{" "}
                    {(d.size_bytes / 1024).toFixed(0)} KB · SHA {d.sha256.slice(0, 8)}
                    {d.agent_version && ` · Agent ${d.agent_version}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDiag.mutate(d.id)}
                    disabled={openDiag.isPending}
                  >
                    <Download className="mr-1.5 h-4 w-4" /> Baixar
                  </Button>
                  {isAdmin && d.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeDiag.mutate(d.id)}
                      disabled={revokeDiag.isPending}
                    >
                      <ShieldOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar nova revisão do checklist</DialogTitle>
            <DialogDescription>
              A revisão começa como rascunho, herdando os dados desta versão. A
              versão anterior fica preservada como histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Etapa do atendimento</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as ServiceStage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_change">Pré-troca</SelectItem>
                  <SelectItem value="post_ont_change">Pós-troca da ONT</SelectItem>
                  <SelectItem value="noc_retest">Reteste NOC</SelectItem>
                  <SelectItem value="additional_test">Teste adicional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Troca da ONT após reprovação"
              />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createRev.mutate()}
              disabled={createRev.isPending || reason.trim().length < 3}
            >
              {createRev.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Criar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
