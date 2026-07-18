import { useQuery } from "@tanstack/react-query";
import { FileText, GitBranch, ShieldOff } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listCaseTimeline } from "@/lib/webi-diagnostic.functions";

const STAGE_LABEL: Record<string, string> = {
  initial: "Atendimento inicial",
  pre_change: "Pré-troca",
  post_ont_change: "Pós-troca da ONT",
  noc_retest: "Reteste NOC",
  additional_test: "Teste adicional",
  before_change: "Antes da troca",
  after_ont_change: "Depois da troca",
};

interface Props {
  caseId: string;
}

export function CaseTimeline({ caseId }: Props) {
  const q = useQuery({
    queryKey: ["case-timeline", caseId],
    queryFn: () => listCaseTimeline({ data: { caseId } }),
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Carregando linha do tempo…
        </CardContent>
      </Card>
    );
  }

  const items = q.data ?? [];
  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="text-base font-semibold">Linha do tempo do atendimento</h3>
        <ol className="relative space-y-3 border-l pl-4">
          {items.map((t) => {
            const isRev = t.kind === "revision";
            const meta = t.meta as Record<string, unknown>;
            const stage = (meta.service_stage ?? meta.test_stage) as
              | string
              | undefined;
            const revStatus = meta.status as string | undefined;
            const revoked = !isRev && revStatus === "revoked";
            return (
              <li key={`${t.kind}-${t.id}`} className="relative">
                <span
                  className={`absolute -left-[21px] flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    isRev
                      ? "border-primary bg-primary/10"
                      : revoked
                        ? "border-red-500 bg-red-500/10"
                        : "border-emerald-500 bg-emerald-500/10"
                  }`}
                >
                  {isRev ? (
                    <GitBranch className="h-2.5 w-2.5 text-primary" />
                  ) : revoked ? (
                    <ShieldOff className="h-2.5 w-2.5 text-red-600" />
                  ) : (
                    <FileText className="h-2.5 w-2.5 text-emerald-600" />
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.at).toLocaleString("pt-BR")}
                  </span>
                  {isRev ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Revisão R{(meta.revision_number as number) ?? "?"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      Diagnóstico
                    </Badge>
                  )}
                  {stage && (
                    <span className="text-xs text-muted-foreground">
                      {STAGE_LABEL[stage] ?? stage}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm">
                  {isRev
                    ? (meta.revision_reason as string) ??
                      (meta.numero_publico as string) ??
                      "Nova versão do checklist"
                    : (meta.original_filename as string) ?? "PDF de diagnóstico"}
                </p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
