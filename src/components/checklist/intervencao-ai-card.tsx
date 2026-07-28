import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runIntervencaoAiAnalysis } from "@/lib/intervencao-ai.functions";
import { INTERVENCAO_RECOMENDACAO_LABEL } from "@/lib/intervencao";
import type { StoredAiAnalysis } from "@/lib/checklist-schema";

interface Props {
  checklistId: string;
  analysis: StoredAiAnalysis | null | undefined;
  disabled?: boolean;
  disabledReason?: string;
}

export function IntervencaoAiCard({ checklistId, analysis, disabled, disabledReason }: Props) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<StoredAiAnalysis | null>(analysis ?? null);

  const mutation = useMutation({
    mutationFn: () => runIntervencaoAiAnalysis({ data: { checklistId } }),
    onSuccess: (result) => {
      setLocal(result);
      toast.success("Análise gerada pela IA.");
      qc.invalidateQueries({ queryKey: ["checklist", checklistId] });
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao gerar a análise."),
  });

  const current = local ?? analysis ?? null;

  return (
    <Card className="rounded-2xl border-cyan-500/35 bg-[#06152d] text-slate-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          Revisão consultiva por IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-400">
          A IA revisa causa, materiais, medições OTDR e resultado, apontando inconsistências antes
          da finalização. A análise fica salva e aparece no laudo em PDF.
        </p>

        {current && (
          <div className="space-y-2 rounded-lg border border-blue-500/30 bg-[#031027] p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-cyan-500/15 text-cyan-300">
                {INTERVENCAO_RECOMENDACAO_LABEL[current.recomendacao] || current.recomendacao}
              </Badge>
              <span className="text-[11px] text-slate-500">
                {new Date(current.gerado_em).toLocaleString("pt-BR")} · {current.modelo_ia}
              </span>
            </div>
            <p>
              <span className="text-slate-400">Diagnóstico:</span> {current.diagnostico_provavel}
            </p>
            <p>
              <span className="text-slate-400">Causa raiz:</span> {current.causa_raiz}
            </p>
            <p>
              <span className="text-slate-400">Justificativa:</span> {current.justificativa}
            </p>
            <p className="text-slate-300">{current.resumo_tecnico}</p>
            {current.inconsistencias?.length ? (
              <ul className="space-y-1">
                {current.inconsistencias.map((item) => (
                  <li key={item} className="flex gap-2 text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Nenhuma inconsistência apontada.
              </p>
            )}
          </div>
        )}

        {disabled && disabledReason && (
          <p className="text-xs text-amber-300">{disabledReason}</p>
        )}

        <Button
          type="button"
          disabled={disabled || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : current ? (
            <RefreshCcw className="mr-1.5 h-4 w-4" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {current ? "Refazer análise" : "Solicitar análise da IA"}
        </Button>
      </CardContent>
    </Card>
  );
}
