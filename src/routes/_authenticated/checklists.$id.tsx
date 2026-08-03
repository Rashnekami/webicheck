import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  Images,
  Loader2,
  Save,
  Trash2,
  MonitorUp,
  WifiOff,
} from "lucide-react";
import {
  queueChecklistUpdate,
  getPendingChecklistUpdate,
  drainPendingChecklistUpdates,
  looksLikeNetworkFailure,
} from "@/lib/offline-checklist-queue";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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

import { useCurrentUser } from "@/hooks/use-current-user";
import { ChecklistForm } from "@/components/checklist/checklist-form";
import { InstalacaoForm } from "@/components/checklist/instalacao-form";
import { RemapeamentoForm } from "@/components/checklist/remapeamento-form";
import { IntervencaoForm } from "@/components/checklist/intervencao-form";
import {
  deleteFoto,
  finalizeChecklist,
  getChecklist,
  listFotos,
  signedFotoUrl,
  updateChecklist,
  uploadFoto,
} from "@/lib/checklists";
import {
  FOTO_CATEGORIAS,
  FOTO_CATEGORIAS_REDE,
  TIPO_LABEL,
  fotoCategoriaLabel,
  groupFotosByCategoria,
  isIntervencao,
  type AnyChecklistData,
  type ChecklistData,
  type ChecklistRow,
  type FotoRow,
  type InstalacaoData,
  type IntervencaoData,
  type RemapeamentoData,
  type TipoIntervencao,
} from "@/lib/checklist-schema";
import { generateChecklistPdf } from "@/components/checklist/checklist-pdf";
import { generateInstalacaoPdf } from "@/components/checklist/instalacao-pdf";
import { generateRemapeamentoPdf } from "@/components/checklist/remapeamento-pdf";
import { generateIntervencaoPdf } from "@/components/checklist/intervencao-pdf";
import { IntervencaoAiCard } from "@/components/checklist/intervencao-ai-card";
import { DocumentActions } from "@/components/checklist/document-actions";
import { SupervisorReviewCard } from "@/components/checklist/supervisor-review-card";
import { CaseRevisionsPanel } from "@/components/checklist/case-revisions-panel";
import { CustomerCounterproofCard } from "@/components/checklist/customer-counterproof-card";
import { OntAiAnalysisCard } from "@/components/checklist/ont-ai-analysis-card";
import { getChecklistCounterproof } from "@/lib/customer-counterproof.functions";
import {
  ensureChecklistSnapshot,
  getChecklistSnapshotSummary,
} from "@/lib/public-checklist.functions";

export const Route = createFileRoute("/_authenticated/checklists/$id")({
  head: () => ({
    meta: [{ title: "Checklist — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: ChecklistDetail,
});

type HeaderPatch = Partial<
  Pick<
    ChecklistRow,
    | "os"
    | "cliente"
    | "cidade"
    | "endereco"
    | "plano"
    | "modelo"
    | "serial"
    | "cto_porta"
    | "data_atendimento"
    | "hora_atendimento"
    | "troca_realizada"
    | "modelo_ont_retirada"
    | "serial_ont_retirada"
    | "modelo_ont_instalada"
    | "serial_ont_instalada"
  >
>;

function ChecklistDetail() {
  const { id } = Route.useParams();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["checklist", id],
    queryFn: () => getChecklist(id),
  });
  // Bug real reportado por técnico: fotos de CTO (remapeamento_cto) e de
  // rompimento/readequação/melhoria_sinal pareciam "não registrar" — o
  // upload em si sempre funcionou (uploadFoto grava no storage e na
  // tabela normalmente), mas esta query só era habilitada pra
  // validacao_ont. Resultado: a foto salvava, mas a tela nunca buscava
  // de volta pra mostrar (parecia sumir), E o PDF desses 4 tipos também
  // lê fotosQuery.data — o documento final saía SEM as fotos, mesmo já
  // existindo no banco. FotosSection é renderizado pra todo tipo de
  // checklist de rede (ver <FotosSection> mais abaixo), então a query
  // precisa estar habilitada pra todos eles, não só ONT.
  const fotosQuery = useQuery({
    queryKey: ["checklist-fotos", id],
    queryFn: () => listFotos(id),
    enabled: !!query.data,
  });
  const ownerId = query.data?.tecnico_id;
  const ownerQuery = useQuery({
    queryKey: ["profile-owner", ownerId],
    enabled: !!ownerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, assinatura")
        .eq("id", ownerId!)
        .maybeSingle();
      return data as {
        full_name: string | null;
        email: string | null;
        assinatura: string | null;
      } | null;
    },
  });
  const isOwner = !!user && !!ownerId && user.id === ownerId;
  const tecnicoNome = isOwner
    ? user?.full_name || user?.email || ""
    : ownerQuery.data?.full_name || ownerQuery.data?.email || "";
  const tecnicoAssinatura = isOwner
    ? (user?.assinatura ?? null)
    : (ownerQuery.data?.assinatura ?? null);

  const [header, setHeader] = useState<HeaderPatch>({});
  const [data, setData] = useState<AnyChecklistData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const row = query.data;
  const readOnly = !row || row.status === "finalizado" || row.tecnico_id !== user?.id;
  const tipo = row?.tipo ?? "validacao_ont";
  const diagnosticCode = row
    ? `${row.numero_publico ?? row.codigo_validacao ?? ""}${row.revision_number > 1 ? `-R${row.revision_number}` : ""}`
    : "";

  function openDiagnostic() {
    if (!diagnosticCode) {
      toast.error("Este checklist ainda não possui código para o diagnóstico.");
      return;
    }
    window.location.href = `webidiagnostic://open?checklist_code=${encodeURIComponent(diagnosticCode)}&webicheck_url=${encodeURIComponent(window.location.origin)}`;
  }

  useEffect(() => {
    if (!row) return;
    const baseHeader: HeaderPatch = {
      os: row.os,
      cliente: row.cliente,
      cidade: row.cidade,
      endereco: row.endereco,
      plano: row.plano,
      modelo: row.modelo,
      serial: row.serial,
      cto_porta: row.cto_porta,
      data_atendimento: row.data_atendimento,
      hora_atendimento: row.hora_atendimento,
      troca_realizada: row.troca_realizada,
      modelo_ont_retirada: row.modelo_ont_retirada,
      serial_ont_retirada: row.serial_ont_retirada,
      modelo_ont_instalada: row.modelo_ont_instalada,
      serial_ont_instalada: row.serial_ont_instalada,
    };
    let cancelled = false;
    // Se existir uma edição feita offline ainda não sincronizada para este
    // checklist, ela é mais recente que o que acabou de vir do servidor —
    // sem isso, reabrir a tela sem rede (ou antes do sync terminar) faria
    // o técnico "perder" o que preencheu, mesmo já estando salvo localmente.
    getPendingChecklistUpdate(row.id).then((pending) => {
      if (cancelled) return;
      if (pending) {
        const { dados, ...headerPatch } = pending.patch as HeaderPatch & {
          dados?: AnyChecklistData;
        };
        setHeader({ ...baseHeader, ...headerPatch });
        setData((dados as AnyChecklistData | undefined) ?? row.dados);
        setOfflineQueued(true);
      } else {
        setHeader(baseHeader);
        setData(row.dados);
        setOfflineQueued(false);
      }
      setDirty(false);
    });
    return () => {
      cancelled = true;
    };
  }, [row?.id, row?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      const patch = { ...header, dados: data ?? undefined };
      try {
        await updateChecklist(id, patch);
        return { queuedOffline: false };
      } catch (error) {
        if (!looksLikeNetworkFailure(error)) throw error;
        await queueChecklistUpdate(id, patch);
        return { queuedOffline: true };
      }
    },
    onSuccess: (result) => {
      setDirty(false);
      setSavedAt(new Date());
      setOfflineQueued(result.queuedOffline);
      if (!result.queuedOffline) qc.invalidateQueries({ queryKey: ["checklists"] });
    },
    onError: () => toast.error("Falha ao salvar. Verifique sua conexão."),
  });

  // Tenta sincronizar a edição pendente deste checklist assim que a rede
  // volta (evento 'online') e uma vez ao abrir a tela, caso já volte online
  // entre uma visita e outra.
  useEffect(() => {
    if (!row?.id) return;
    async function trySync() {
      const { synced } = await drainPendingChecklistUpdates(async (checklistId, patch) => {
        await updateChecklist(checklistId, patch);
      });
      if (synced.includes(row!.id)) {
        setOfflineQueued(false);
        setSavedAt(new Date());
        qc.invalidateQueries({ queryKey: ["checklists"] });
        qc.invalidateQueries({ queryKey: ["checklist", row!.id] });
        toast.success("Sincronizado — as alterações feitas offline foram salvas.");
      }
    }
    trySync();
    window.addEventListener("online", trySync);
    return () => window.removeEventListener("online", trySync);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty || readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save.mutate(), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, data, dirty, readOnly]);

  const finalize = useMutation({
    mutationFn: async () => {
      // Finalizar dispara geração de snapshot/PDF no servidor — não dá pra
      // colocar na fila offline como o autosave. Bloqueia cedo com uma
      // mensagem clara em vez de deixar a chamada falhar sem explicação.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error(
          "Sem conexão. Os dados já estão salvos localmente — finalize quando a rede voltar.",
        );
      }
      await updateChecklist(id, { ...header, dados: data ?? undefined });
      return finalizeChecklist(id);
    },
    onSuccess: () => {
      toast.success("Checklist finalizado.");
      setFinalizeOpen(false);
      qc.invalidateQueries({ queryKey: ["checklist", id] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar."),
  });

  const missing = useMemo(() => {
    const errs: string[] = [];
    if (!data) return errs;
    if (!header.cidade?.trim()) errs.push("Cidade");
    if (!header.data_atendimento) errs.push("Data do atendimento");
    if (tipo === "validacao_ont") {
      if (!header.cliente?.trim()) errs.push("Cliente");
      const d = data as ChecklistData;
      if (!header.modelo?.trim()) errs.push("Modelo da ONT");
      if (!header.serial?.trim()) errs.push("Serial da ONT");
      const equipmentUnavailable = d.sintoma.ont_queimada || d.sintoma.ont_danificada_cliente;
      if (!equipmentUnavailable && !d.teste_cabeado.aplicabilidade) {
        errs.push("Aplicabilidade do teste cabeado");
      }
      if (!d.relato?.trim()) errs.push("Relato do técnico");
    } else if (tipo === "instalacao") {
      if (!header.cliente?.trim()) errs.push("Cliente");
      if (!header.endereco?.trim()) errs.push("Endereço");
    } else if (tipo === "remapeamento_cto") {
      // Remapeamento não exige cliente/endereço: é uma intervenção de rede.
      const d = data as RemapeamentoData;
      if (!d.identificacao.cto_codigo?.trim()) errs.push("Código da CTO/NAP");
      const ativoOk = d.localizacao.ativo?.confirmed || !!d.localizacao.confirmada;
      if (!ativoOk) errs.push("Confirmação manual da localização da CTO no mapa");
      if (!d.splitter.tipo) errs.push("Tipo do splitter");
    } else if (isIntervencao(tipo)) {
      const d = data as IntervencaoData;
      if (!d.contexto.causa) errs.push("Causa da intervenção");
      if (!d.contexto.descricao?.trim()) errs.push("Descrição da ocorrência");
      if (d.rota.pontos.length === 0) errs.push("Pelo menos um ponto georreferenciado no mapa");
      if (!d.resultado.estado) errs.push("Estado final da intervenção");
      if (tipo === "melhoria_sinal" && (!d.sinal.antes_dbm || !d.sinal.depois_dbm)) {
        errs.push("Potência óptica antes e depois");
      }
    }
    return errs;
  }, [header, data, tipo]);

  async function resolveValidationUrl(): Promise<string | null> {
    const current = await getChecklistSnapshotSummary({ data: { checklistId: id } });
    if (current && current.public_status !== "active") return null;
    const snapshot =
      current ?? (await ensureChecklistSnapshot({ data: { checklistId: id, forceNew: false } }));
    return `${window.location.origin}/validar/${snapshot.public_token}`;
  }

  async function handlePdf(publicUrlHint?: string | null) {
    if (!row) return;
    try {
      setPdfBusy(true);
      const publicUrl = publicUrlHint || (await resolveValidationUrl());
      const merged = { ...row, ...header, dados: data } as ChecklistRow;
      const counterproof = await getChecklistCounterproof({ data: { checklistId: id } });
      const counterproofDocument =
        counterproof && "status" in counterproof && counterproof.status === "validated"
          ? counterproof
          : null;
      if (tipo === "instalacao") {
        await generateInstalacaoPdf({
          row: merged,
          tecnicoNome,
          assinatura: tecnicoAssinatura,
          publicUrl,
          counterproof: counterproofDocument,
        });
      } else if (isIntervencao(tipo)) {
        await generateIntervencaoPdf({
          row: merged,
          tecnicoNome,
          assinatura: tecnicoAssinatura,
          publicUrl,
          fotos: fotosQuery.data ?? [],
        });
      } else if (tipo === "remapeamento_cto") {
        await generateRemapeamentoPdf({
          row: merged,
          tecnicoNome,
          assinatura: tecnicoAssinatura,
          publicUrl,
          fotos: fotosQuery.data ?? [],
        });
      } else {
        await generateChecklistPdf({
          row: merged,
          fotos: fotosQuery.data ?? [],
          tecnicoNome,
          assinatura: tecnicoAssinatura,
          publicUrl,
          counterproof: counterproofDocument,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (query.isLoading || !row || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WebifibraLogo size={56} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={
        tipo === "instalacao" || isIntervencao(tipo)
          ? "webi-page min-h-screen bg-[#020817] pb-24"
          : "webi-page min-h-screen pb-24"
      }
    >
      <header className="brand-gradient sticky top-0 z-10 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/checklists"
              className="webi-icon h-10 w-10 rounded-full hover:border-cyan-300/70"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-xs uppercase tracking-[.16em] text-cyan-400">
                {TIPO_LABEL[tipo]} · {row.status === "finalizado" ? "Finalizado" : "Rascunho"}
              </p>
              <h1 className="truncate text-base font-semibold">
                {header.cliente || "Sem cliente"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {row.status === "finalizado" ? (
              <Badge className="bg-emerald-500/20 text-white hover:bg-emerald-500/30">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {row.intervention_code ||
                  (row as ChecklistRow & { rmap_code?: string | null }).rmap_code ||
                  row.codigo_validacao}
              </Badge>
            ) : save.isPending ? (
              <Badge className="bg-white/20 text-white">
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Salvando
              </Badge>
            ) : dirty ? (
              <Badge className="bg-white/20 text-white">Alterações pendentes</Badge>
            ) : offlineQueued ? (
              <Badge className="bg-amber-500/25 text-amber-200">
                <WifiOff className="mr-1 h-3.5 w-3.5" /> Salvo localmente — sincroniza quando a rede voltar
              </Badge>
            ) : savedAt ? (
              <Badge className="bg-white/20 text-white">
                <Save className="mr-1 h-3.5 w-3.5" /> Salvo
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
        {tipo === "instalacao" ? (
          <InstalacaoForm
            header={{
              os: header.os ?? null,
              cliente: header.cliente ?? null,
              cidade: header.cidade ?? null,
              endereco: header.endereco ?? null,
              plano: header.plano ?? null,
              data_atendimento: header.data_atendimento ?? null,
              hora_atendimento: header.hora_atendimento ?? null,
            }}
            data={data as InstalacaoData}
            readOnly={readOnly}
            onHeaderChange={(patch) => {
              setHeader((p) => ({ ...p, ...patch }));
              setDirty(true);
            }}
            onDataChange={(fn) => {
              setData((p) => fn(p as InstalacaoData));
              setDirty(true);
            }}
          />
        ) : isIntervencao(tipo) ? (
          <>
            <IntervencaoForm
              tipo={tipo as TipoIntervencao}
              header={{
                os: header.os ?? null,
                cliente: header.cliente ?? null,
                cidade: header.cidade ?? null,
                endereco: header.endereco ?? null,
                data_atendimento: header.data_atendimento ?? null,
                hora_atendimento: header.hora_atendimento ?? null,
              }}
              data={data as IntervencaoData}
              checklistId={row.id}
              tecnicoId={row.tecnico_id}
              readOnly={readOnly}
              onHeaderChange={(patch) => {
                setHeader((p) => ({ ...p, ...patch }));
                setDirty(true);
              }}
              onDataChange={(fn) => {
                setData((p) => fn(p as IntervencaoData));
                setDirty(true);
              }}
            />
            <FotosSection
              checklistId={id}
              tecnicoId={row.tecnico_id}
              readOnly={readOnly}
              canDelete={row.status === "rascunho" && row.tecnico_id === user?.id}
              fotos={fotosQuery.data ?? []}
              isLoading={fotosQuery.isLoading}
              isError={fotosQuery.isError}
              error={fotosQuery.error}
              categorias={FOTO_CATEGORIAS_REDE}
              titulo="Evidências fotográficas (antes e depois)"
            />
            {row.status === "rascunho" && row.tecnico_id === user?.id && (
              <IntervencaoAiCard
                checklistId={id}
                analysis={(data as IntervencaoData).ai_analysis ?? null}
                disabled={dirty || save.isPending}
                disabledReason={
                  dirty || save.isPending
                    ? "Salvando alterações... aguarde antes de solicitar a análise."
                    : undefined
                }
              />
            )}
          </>
        ) : tipo === "remapeamento_cto" ? (
          <RemapeamentoForm
            header={{
              os: header.os ?? null,
              cliente: header.cliente ?? null,
              cidade: header.cidade ?? null,
              endereco: header.endereco ?? null,
              data_atendimento: header.data_atendimento ?? null,
              hora_atendimento: header.hora_atendimento ?? null,
            }}
            data={data as RemapeamentoData}
            checklistId={row.id}
            tecnicoId={row.tecnico_id}
            readOnly={readOnly}
            onHeaderChange={(patch) => {
              setHeader((p) => ({ ...p, ...patch }));
              setDirty(true);
            }}
            onDataChange={(fn) => {
              setData((p) => fn(p as RemapeamentoData));
              setDirty(true);
            }}
          />
        ) : null}
        {/* Fotos do remapeamento ficam nos blocos ANTES/DEPOIS dentro do próprio formulário */}

        {tipo === "validacao_ont" ? (
          <>
            <ChecklistForm
              header={{
                os: header.os ?? null,
                cliente: header.cliente ?? null,
                cidade: header.cidade ?? null,
                endereco: header.endereco ?? null,
                modelo: header.modelo ?? null,
                serial: header.serial ?? null,
                cto_porta: header.cto_porta ?? null,
                data_atendimento: header.data_atendimento ?? null,
                hora_atendimento: header.hora_atendimento ?? null,
                troca_realizada: header.troca_realizada ?? null,
                modelo_ont_retirada: header.modelo_ont_retirada ?? null,
                serial_ont_retirada: header.serial_ont_retirada ?? null,
                modelo_ont_instalada: header.modelo_ont_instalada ?? null,
                serial_ont_instalada: header.serial_ont_instalada ?? null,
              }}
              data={data as ChecklistData}
              readOnly={readOnly}
              onHeaderChange={(patch) => {
                setHeader((p) => ({ ...p, ...patch }));
                setDirty(true);
              }}
              onDataChange={(fn) => {
                setData((p) => fn(p as ChecklistData));
                setDirty(true);
              }}
            />

            <FotosSection
              checklistId={id}
              tecnicoId={row.tecnico_id}
              readOnly={readOnly}
              canDelete={row.status === "rascunho" && row.tecnico_id === user?.id}
              fotos={fotosQuery.data ?? []}
              isLoading={fotosQuery.isLoading}
              isError={fotosQuery.isError}
              error={fotosQuery.error}
            />

            {row.status === "rascunho" && row.tecnico_id === user?.id && (
              <OntAiAnalysisCard
                checklistId={id}
                analysis={(data as ChecklistData).ai_analysis ?? null}
                tipoManutencao={(data as ChecklistData).tipo_manutencao ?? null}
                disabled={dirty || save.isPending}
                disabledReason={
                  dirty || save.isPending
                    ? "Salvando alterações... aguarde antes de solicitar a análise."
                    : undefined
                }
              />
            )}
          </>
        ) : null}


        {row.status === "finalizado" && (
          <>
            <CustomerCounterproofCard checklistId={id} isAdmin={!!user?.isAdmin} />
            <DocumentActions
              row={{ ...row, ...header, dados: data } as ChecklistRow}
              tecnicoNome={tecnicoNome}
              assinatura={tecnicoAssinatura}
              isAdmin={!!user?.isAdmin}
              onDownloadPdf={handlePdf}
              pdfBusy={pdfBusy}
              fotos={fotosQuery.data ?? []}
            />

            <CaseRevisionsPanel
              row={row as never}
              isAdmin={!!user?.isAdmin}
              fotos={fotosQuery.data ?? []}
              tecnicoNome={tecnicoNome}
              tecnicoAssinatura={tecnicoAssinatura}
            />

            <SupervisorReviewCard
              row={row as ChecklistRow}
              canReview={!!(user?.isSupervisor || user?.isAdmin || user?.isPlatformAdmin)}
            />

            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <p>
                  <span className="text-muted-foreground">Código de validação:</span>{" "}
                  <b>{row.codigo_validacao}</b>
                </p>
                {row.intervention_code && (
                  <p>
                    <span className="text-muted-foreground">Código da intervenção:</span>{" "}
                    <b>{row.intervention_code}</b>
                  </p>
                )}
                {row.exchange_ticket_code && (
                  <p>
                    <span className="text-muted-foreground">Ticket da troca:</span>{" "}
                    <b>{row.exchange_ticket_code}</b>
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Finalizado em:</span>{" "}
                  {row.finalizado_em ? new Date(row.finalizado_em).toLocaleString("pt-BR") : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Registro imutável para fins de fiscalização.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-blue-400/20 bg-[#030d21]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={() => navigate({ to: "/checklists" })}>
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            {row.status === "finalizado" &&
              (import.meta.env.VITE_WEBI_DIAGNOSTIC_ENABLED === "true" ? (
                <Button variant="outline" onClick={openDiagnostic}>
                  <MonitorUp className="mr-1.5 h-4 w-4" /> Abrir no Webi Diagnostic
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  title="Integração com Webi Diagnostic em homologação"
                  aria-label="Webi Diagnostic em homologação"
                >
                  <MonitorUp className="mr-1.5 h-4 w-4" /> Webi Diagnostic — Em homologação
                </Button>
              ))}
            {row.status === "finalizado" && (
              <Button onClick={() => handlePdf()} disabled={pdfBusy}>
                {pdfBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                Baixar PDF
              </Button>
            )}
            {row.status === "rascunho" && row.tecnico_id === user?.id && (
              <>
                <Button
                  variant="outline"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !dirty}
                >
                  {save.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Salvar
                </Button>
                <Button onClick={() => setFinalizeOpen(true)}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Finalizar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar checklist?</DialogTitle>
            <DialogDescription>
              Após finalizar, o checklist não poderá mais ser editado nem apagado — nem por
              administradores. Ele fica disponível para fiscalização e para gerar o PDF.
            </DialogDescription>
          </DialogHeader>
          {missing.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Preencha antes de finalizar:</p>
              <ul className="mt-1 list-inside list-disc text-destructive">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Um código de validação único será gerado automaticamente.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => finalize.mutate()}
              disabled={missing.length > 0 || finalize.isPending}
            >
              {finalize.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmar finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FotosSection({
  checklistId,
  tecnicoId,
  readOnly,
  canDelete,
  fotos,
  isLoading,
  isError,
  error,
  categorias = FOTO_CATEGORIAS,
  titulo = "Fotos de evidência",
}: {
  checklistId: string;
  tecnicoId: string;
  readOnly: boolean;
  canDelete: boolean;
  fotos: FotoRow[];
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  categorias?: { value: FotoRow["categoria"]; label: string }[];
  titulo?: string;
}) {
  const qc = useQueryClient();
  const [cat, setCat] = useState<FotoRow["categoria"]>(categorias[0]?.value ?? "etiqueta");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const up = useMutation({
    mutationFn: async (file: File) => uploadFoto({ checklistId, tecnicoId, categoria: cat, file }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-fotos", checklistId] });
      toast.success("Foto anexada.");
    },
    onError: () => toast.error("Falha no upload."),
  });

  const del = useMutation({
    mutationFn: (f: FotoRow) => deleteFoto(f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-fotos", checklistId] }),
  });

  function handleSelectedFile(file: File | undefined, input: HTMLInputElement) {
    if (file) up.mutate(file);
    input.value = "";
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{titulo}</h3>
          <span className="text-xs text-muted-foreground">
            {fotos.length} anexada{fotos.length === 1 ? "" : "s"}
          </span>
        </div>

        {!readOnly && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Categoria</Label>
              <Select value={cat} onValueChange={(v) => setCat(v as FotoRow["categoria"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleSelectedFile(e.target.files?.[0], e.currentTarget)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleSelectedFile(e.target.files?.[0], e.currentTarget)}
            />
            <Button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={up.isPending}
            >
              {up.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-1.5 h-4 w-4" />
              )}
              Tirar foto
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => galleryInputRef.current?.click()}
              disabled={up.isPending}
            >
              <Images className="mr-1.5 h-4 w-4" />
              Galeria
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Carregando fotos…</p>
        ) : isError ? (
          // Antes um erro de leitura (RLS, rede, o que for) virava
          // silenciosamente "Nenhuma foto anexada." — indistinguível de
          // realmente não ter foto nenhuma. Isso escondeu o bug relatado
          // por semanas: parecia "sem foto" quando na verdade era falha
          // ao buscar. Mostra o erro de verdade agora.
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            Não foi possível carregar as fotos.{" "}
            {error instanceof Error ? error.message : "Erro desconhecido."}
          </div>
        ) : fotos.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma foto anexada.</p>
        ) : (
          <FotosGrouped fotos={fotos} canDelete={canDelete} onDelete={(f) => del.mutate(f)} />
        )}
      </CardContent>
    </Card>
  );
}

// Antes exibia todas as fotos numa grade só, na ordem de upload — antes,
// depois e etiqueta apareciam misturadas sem nenhuma separação visual.
// Agrupa por categoria (antes/depois sempre primeiro, ver
// fotoCategoriaSortWeight) com um cabeçalho por grupo.
function FotosGrouped({
  fotos,
  canDelete,
  onDelete,
}: {
  fotos: FotoRow[];
  canDelete: boolean;
  onDelete: (foto: FotoRow) => void;
}) {
  return (
    <div className="space-y-4">
      {groupFotosByCategoria(fotos).map(([categoria, group]) => (
        <div key={categoria}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {fotoCategoriaLabel(categoria)} ({group.length})
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.map((f) => (
              <FotoTile key={f.id} foto={f} canDelete={canDelete} onDelete={() => onDelete(f)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FotoTile({
  foto,
  canDelete,
  onDelete,
}: {
  foto: FotoRow;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    signedFotoUrl(foto.storage_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [foto.storage_path]);

  const label = FOTO_CATEGORIAS.find((c) => c.value === foto.categoria)?.label ?? "";

  return (
    <li className="group relative overflow-hidden rounded-md border">
      {url ? (
        // Abre a foto original em tamanho cheio numa aba nova — no
        // celular dá pra segurar e "Salvar imagem"; no PC, clique
        // direito e salvar. Sem isso só existia a miniatura de 128px.
        <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir foto original">
          <img src={url} alt={label} className="h-32 w-full bg-muted object-contain" />
        </a>
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-muted">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="p-2 text-xs">
        <p className="truncate font-medium">{label}</p>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-1 top-1 rounded-full bg-background/80 p-1 opacity-0 shadow transition group-hover:opacity-100"
          aria-label="Remover foto"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </li>
  );
}
