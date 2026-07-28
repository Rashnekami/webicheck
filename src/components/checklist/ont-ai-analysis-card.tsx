import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, RefreshCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runOntAiAnalysis } from "@/lib/ont-checklist-ai.functions";
import { labelTipoManutencao, RECOMENDACAO_LABEL } from "@/lib/ont-checklist-ai";
import type { StoredAiAnalysis } from "@/lib/checklist-schema";

interface Props {
  checklistId: string;
  analysis: StoredAiAnalysis | null | undefined;
  tipoManutencao: string | null | undefined;
  disabled?: boolean;
  disabledReason?: string;
}

export function OntAiAnalysisCard({
  checklistId,
  analysis,
  tipoManutencao,
  disabled,
  disabledReason,
}: Props) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<StoredAiAnalysis | null>(analysis ?? null);

  const mutation = useMutation({
    mutationFn: () => runOntAiAnalysis({ data: { checklistId } }),
    onSuccess: (result) => {
      setLocal(result);
      toast.success("Análise gerada pela IA.");
      qc.invalidateQueries({ queryKey: ["checklist", checklistId] });
    },
    onError: (e) => {
      const msg = (e as Error).message || "Falha ao gerar a análise.";
      toast.error(msg);
    },
  });

  const current = local ?? analysis ?? null;
  const canRun = !disabled && !!tipoManutencao;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          Análise por IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Envie o checklist preenchido para uma revisão consultiva por IA. A análise fica salva no
          checklist e aparece no PDF.
        </p>

        {!tipoManutencao && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-300">
            Selecione o <b>Tipo de manutenção</b> na Seção 1 antes de solicitar a análise.
          </div>
        )}
        {disabled && disabledReason && (
          <div className="rounded-md border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
            {disabledReason}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canRun || mutation.isPending}
            size="sm"
          >
            {mutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : current ? (
              <RefreshCcw className="mr-1.5 h-4 w-4" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {current ? "Gerar nova análise" : "Solicitar análise"}
          </Button>
        </div>

        {current && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {RECOMENDACAO_LABEL[current.recomendacao] ?? current.recomendacao}
              </Badge>
              <Badge variant="outline">
                Manutenção: {labelTipoManutencao(current.tipo_manutencao)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Gerado em {new Date(current.gerado_em).toLocaleString("pt-BR")} · {current.modelo_ia}
              </span>
            </div>
            <Field label="Diagnóstico provável" value={current.diagnostico_provavel} />
            <Field label="Causa raiz" value={current.causa_raiz} />
            <Field label="Justificativa" value={current.justificativa} />
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Inconsistências detectadas
              </p>
              {current.inconsistencias.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Nenhuma inconsistência apontada.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {current.inconsistencias.map((item, index) => (
                    <li key={index} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field label="Resumo técnico" value={current.resumo_tecnico} />
            <p className="text-[11px] text-muted-foreground">
              Uso consultivo. As decisões operacionais permanecem com o técnico e o NOC.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}
