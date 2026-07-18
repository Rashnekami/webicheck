import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, RefreshCw, ShieldOff, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getDiagnosticDownloadUrl,
  listDiagnosticReports,
  revokeDiagnosticReport,
  type DiagnosticReportRow,
  type TestStage,
} from "@/lib/webi-diagnostic.functions";

const STAGE_ORDER: TestStage[] = [
  "before_change",
  "after_ont_change",
  "noc_retest",
  "additional_test",
];

const STAGE_LABEL: Record<TestStage, string> = {
  before_change: "Antes da troca",
  after_ont_change: "Depois da troca",
  noc_retest: "Reteste NOC",
  additional_test: "Adicional",
};

const STATUS_LABEL: Record<DiagnosticReportRow["status"], string> = {
  active: "Ativo",
  revoked: "Revogado",
  replaced: "Substituído",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  caseId: string;
  isAdmin: boolean;
}

export function DiagnosticsSection({ caseId, isAdmin }: Props) {
  const qc = useQueryClient();
  const diagsQ = useQuery({
    queryKey: ["case-diagnostics", caseId],
    queryFn: () => listDiagnosticReports({ data: { caseId } }),
  });

  const openDiag = useMutation({
    mutationFn: (id: string) =>
      getDiagnosticDownloadUrl({ data: { reportId: id } }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeDiag = useMutation({
    mutationFn: (id: string) => revokeDiagnosticReport({ data: { reportId: id } }),
    onSuccess: () => {
      toast.success("Diagnóstico revogado.");
      qc.invalidateQueries({ queryKey: ["case-diagnostics", caseId] });
      qc.invalidateQueries({ queryKey: ["case-timeline", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const map: Record<TestStage, DiagnosticReportRow[]> = {
      before_change: [],
      after_ont_change: [],
      noc_retest: [],
      additional_test: [],
    };
    (diagsQ.data ?? []).forEach((d) => {
      if (map[d.test_stage]) map[d.test_stage].push(d);
    });
    return map;
  }, [diagsQ.data]);

  const total = diagsQ.data?.length ?? 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">
              Diagnósticos Webi Diagnostic
            </h3>
            <p className="text-xs text-muted-foreground">
              {total === 0
                ? "Nenhum diagnóstico anexado ainda."
                : `${total} relatório(s) recebido(s) do Agent.`}
            </p>
          </div>
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

        {!diagsQ.isLoading && total === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Use o Webi Diagnostic Agent para enviar o PDF automaticamente. Os
            arquivos aparecerão aqui agrupados por etapa do atendimento.
          </div>
        )}

        {total > 0 && (
          <div className="space-y-4">
            {STAGE_ORDER.map((stage) => {
              const list = grouped[stage];
              if (list.length === 0) return null;
              return (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold">
                      {STAGE_LABEL[stage]}
                    </h4>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {list.length}
                    </Badge>
                  </div>
                  <div className="divide-y rounded-md border">
                    {list.map((d) => (
                      <div
                        key={d.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">
                              {d.original_filename}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              #{d.report_sequence}
                            </Badge>
                            {d.status !== "active" && (
                              <Badge
                                className={
                                  d.status === "revoked"
                                    ? "bg-red-500/15 text-red-800"
                                    : "bg-amber-500/15 text-amber-800"
                                }
                              >
                                {STATUS_LABEL[d.status]}
                              </Badge>
                            )}
                          </div>
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-4">
                            <div>
                              <dt className="inline">Sessão: </dt>
                              <dd className="inline font-mono">
                                {d.diagnostic_session_id.slice(0, 8)}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">Agent: </dt>
                              <dd className="inline">
                                {d.agent_version ?? "—"}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">SHA-256: </dt>
                              <dd className="inline font-mono">
                                {d.sha256.slice(0, 10)}…
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">Tamanho: </dt>
                              <dd className="inline">
                                {formatSize(d.size_bytes)}
                              </dd>
                            </div>
                            <div className="col-span-2 sm:col-span-2">
                              <dt className="inline">Recebido: </dt>
                              <dd className="inline">
                                {new Date(d.created_at).toLocaleString("pt-BR")}
                              </dd>
                            </div>
                            {d.generated_at && (
                              <div className="col-span-2 sm:col-span-2">
                                <dt className="inline">Gerado em: </dt>
                                <dd className="inline">
                                  {new Date(d.generated_at).toLocaleString(
                                    "pt-BR",
                                  )}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                        <div className="flex shrink-0 gap-1">
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
                              onClick={() => {
                                if (
                                  confirm(
                                    "Revogar este diagnóstico? Ele será mantido no histórico, mas removido do dossiê atual.",
                                  )
                                )
                                  revokeDiag.mutate(d.id);
                              }}
                              disabled={revokeDiag.isPending}
                              title="Revogar diagnóstico"
                            >
                              <ShieldOff className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
