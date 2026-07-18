import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileArchive, FileDown, FilePlus2, Files, Loader2 } from "lucide-react";
import type { FotoRow } from "@/lib/checklist-schema";
import { downloadChecklistOnly, generateDossiePdf } from "@/components/checklist/dossie-pdf";
import { DiagnosticsSection } from "@/components/checklist/diagnostics-section";
import { CaseTimeline } from "@/components/checklist/case-timeline";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  listDiagnosticReports,
  type ServiceStage,
} from "@/lib/webi-diagnostic.functions";

type RevisionStage =
  | "pre_change"
  | "post_ont_change"
  | "noc_retest"
  | "additional_test";

const STAGE_LABELS: Record<ServiceStage, string> = {
  initial: "Atendimento inicial",
  pre_change: "Pré-troca",
  post_ont_change: "Pós-troca da ONT",
  noc_retest: "Reteste NOC",
  additional_test: "Teste adicional",
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
  fotos?: FotoRow[];
  tecnicoNome?: string;
  tecnicoAssinatura?: string | null;
}

export function CaseRevisionsPanel({
  row,
  isAdmin,
  fotos = [],
  tecnicoNome = "",
  tecnicoAssinatura = null,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const caseId = row.case_id ?? row.id;

  const diagsQ = useQuery({
    queryKey: ["case-diagnostics", caseId],
    queryFn: () => listDiagnosticReports({ data: { caseId } }),
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

  const [busy, setBusy] = useState<"none" | "checklist" | "revision" | "dossie">("none");
  async function handleChecklistOnly() {
    try {
      setBusy("checklist");
      await downloadChecklistOnly({ row, fotos, tecnicoNome, assinatura: tecnicoAssinatura });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF do checklist.");
    } finally {
      setBusy("none");
    }
  }
  async function handleRevisionPdf() {
    try {
      setBusy("revision");
      await generateDossiePdf({
        row,
        fotos,
        tecnicoNome,
        assinatura: tecnicoAssinatura,
        diagnostics: diagsQ.data ?? [],
        scope: "revision",
      });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF desta versão.");
    } finally {
      setBusy("none");
    }
  }
  async function handleDossie() {
    try {
      setBusy("dossie");
      await generateDossiePdf({
        row,
        fotos,
        tecnicoNome,
        assinatura: tecnicoAssinatura,
        diagnostics: diagsQ.data ?? [],
        scope: "case",
      });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o dossiê.");
    } finally {
      setBusy("none");
    }
  }

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
            <div className="flex flex-wrap gap-1">
              {isFinalizado && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleChecklistOnly}
                    disabled={busy !== "none"}
                    title="Baixar somente o checklist desta versão"
                  >
                    {busy === "checklist" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Checklist
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRevisionPdf}
                    disabled={busy !== "none"}
                    title="Checklist + diagnósticos desta versão"
                  >
                    {busy === "revision" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Files className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Versão completa
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDossie}
                    disabled={busy !== "none"}
                    title="Dossiê completo do atendimento (todas as revisões e diagnósticos)"
                  >
                    {busy === "dossie" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileArchive className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Dossiê completo
                  </Button>
                </>
              )}
              {isFinalizado && row.is_current !== false && (
                <Button size="sm" onClick={() => setRevOpen(true)}>
                  <FilePlus2 className="mr-1.5 h-4 w-4" /> Criar revisão
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <CaseTimeline caseId={caseId} />

      <DiagnosticsSection caseId={caseId} isAdmin={isAdmin} />

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
