import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reviewChecklist } from "@/lib/supervisor.functions";
import type { ChecklistRow } from "@/lib/checklist-schema";

interface Props {
  row: ChecklistRow;
  canReview: boolean;
}

export function SupervisorReviewCard({ row, canReview }: Props) {
  const qc = useQueryClient();
  const [comment, setComment] = useState(row.review_comment ?? "");
  const [mode, setMode] = useState<"idle" | "reject">("idle");

  const mutation = useMutation({
    mutationFn: (decision: "aprovado" | "reprovado") =>
      reviewChecklist({ data: { checklistId: row.id, decision, comment } }),
    onSuccess: async (_r, decision) => {
      toast.success(decision === "aprovado" ? "Checklist aprovado." : "Checklist reprovado — técnico será notificado.");
      setMode("idle");
      await qc.invalidateQueries({ queryKey: ["checklist", row.id] });
      await qc.invalidateQueries({ queryKey: ["checklists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = row.review_status ?? "pendente";

  return (
    <Card className="border-blue-400/25 bg-slate-950/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold">Revisão do supervisor</h3>
          </div>
          {status === "aprovado" && (
            <Badge className="border-emerald-400/30 bg-emerald-500/15 text-emerald-300">Aprovado</Badge>
          )}
          {status === "reprovado" && (
            <Badge className="border-rose-400/30 bg-rose-500/15 text-rose-300">
              {row.locked_for_rework ? "Reprovado — refazer (Rn)" : "Reprovado"}
            </Badge>
          )}
          {status === "pendente" && (
            <Badge className="border-amber-400/30 bg-amber-500/15 text-amber-300">Pendente</Badge>
          )}
        </div>

        {row.review_comment && (
          <div className="rounded-lg border border-blue-400/15 bg-slate-950/45 p-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Comentário</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-100">{row.review_comment}</p>
            {row.reviewed_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                Revisado em {new Date(row.reviewed_at).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}

        {canReview && status !== "aprovado" && (
          <>
            {mode === "reject" ? (
              <div className="space-y-2">
                <Label htmlFor="rev-comment">Motivo da reprovação</Label>
                <Textarea
                  id="rev-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Descreva o que precisa ser corrigido…"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMode("idle")}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => mutation.mutate("reprovado")}
                    disabled={mutation.isPending || comment.trim().length < 3}
                  >
                    {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <XCircle className="mr-1.5 h-4 w-4" />}
                    Confirmar reprovação
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-400/30 text-rose-300 hover:bg-rose-500/10"
                  onClick={() => setMode("reject")}
                  disabled={mutation.isPending}
                >
                  <XCircle className="mr-1.5 h-4 w-4" /> Reprovar
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={() => mutation.mutate("aprovado")}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                  Aprovar
                </Button>
              </div>
            )}
          </>
        )}

        {!canReview && status === "pendente" && (
          <p className="text-xs text-muted-foreground">Aguardando revisão do supervisor responsável.</p>
        )}
      </CardContent>
    </Card>
  );
}
