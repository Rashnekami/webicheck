import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Bot,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  ClipboardCheck,
  CloudOff,
  Database,
  FileDown,
  FlaskConical,
  Gauge,
  Lightbulb,
  ListRestart,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Network,
  RotateCcw,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PROFILE_CITIES } from "@/lib/profile-cities";
import {
  createSmartDiagnosticSession,
  evaluateSmartDiagnostic,
  getDiagnosticProgress,
  getNextDiagnosticQuestion,
  SMART_DIAGNOSTIC_ENGINE_VERSION,
  SMART_DIAGNOSTIC_STORAGE_KEY,
  SYMPTOM_GROUPS,
  createDiagnosticDecisionEvent,
  DIAGNOSTIC_FAST_TRACK_AFTER,
  type DiagnosticAnswer,
  type DiagnosticOption,
  type SmartDiagnosticSession,
  type DiagnosticOperation,
  type SymptomId,
} from "@/lib/smart-diagnostic";
import {
  getSmartDiagnosticAiStatus,
  healthCheckSmartDiagnosticAiGateway,
  compareSmartDiagnosticAiProviders,
  createDiagnosticOntExchangeDraft,
  createDiagnosticRetestDraft,
  runSmartDiagnosticAiReview,
  syncSmartDiagnosticSession,
  validateSmartDiagnosticForLearning,
} from "@/lib/smart-diagnostic-ai.functions";
import type { AiDiagnosticReview } from "@/lib/smart-diagnostic-ai";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/diagnostico-inteligente")({
  head: () => ({
    meta: [
      { title: "Diagnóstico Inteligente Beta — Webifibra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SmartDiagnosticBetaPage,
});

type Stage = "setup" | "triage" | "diagnosis";

interface StoredBeta {
  stage: Stage;
  session: SmartDiagnosticSession;
}

const metricFields = [
  { id: "download", label: "Download (Mbps)", inputMode: "decimal" as const },
  { id: "upload", label: "Upload (Mbps)", inputMode: "decimal" as const },
  { id: "ping", label: "Ping (ms)", inputMode: "decimal" as const },
  { id: "jitter", label: "Jitter (ms) — opcional", inputMode: "decimal" as const },
  { id: "device", label: "Dispositivo utilizado", inputMode: "text" as const },
  { id: "connection", label: "Conexão: 2.4 GHz, 5 GHz ou cabo", inputMode: "text" as const },
  { id: "distance", label: "Distância aproximada da ONT", inputMode: "text" as const },
  { id: "plan", label: "Plano contratado", inputMode: "text" as const },
];

const opticalMetricFields = [
  { id: "rxOnt", label: "RX recebido na ONT (dBm)", placeholder: "Ex.: -19,4" },
  { id: "rxOlt", label: "RX recebido na OLT (dBm) — opcional", placeholder: "Ex.: -22,1" },
  {
    id: "source",
    label: "Origem da leitura",
    placeholder: "Ex.: interface da ONT, OLT ou medidor",
  },
];

type PersistenceState = "local" | "saving" | "saved" | "migration_pending" | "error";

function locationDisplay(location: SmartDiagnosticSession["metadata"]["location"]) {
  if (location?.status === "captured" || location?.status === "low_accuracy") {
    const coordinates =
      typeof location.latitude === "number" && typeof location.longitude === "number"
        ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
        : "coordenadas registradas";
    return `${coordinates} · precisão ${location.accuracyMeters ?? "—"} m${location.status === "low_accuracy" ? " (aproximada)" : ""}`;
  }
  if (location?.status === "denied") return "Permissão negada no navegador";
  return "Não capturada · toque em Atualizar";
}

function loadStoredBeta(): StoredBeta {
  if (typeof window === "undefined") {
    return { stage: "setup", session: createSmartDiagnosticSession() };
  }
  try {
    const raw = window.localStorage.getItem(SMART_DIAGNOSTIC_STORAGE_KEY);
    if (!raw) return { stage: "setup", session: createSmartDiagnosticSession() };
    const parsed = JSON.parse(raw) as StoredBeta;
    if (parsed.session?.engineVersion !== SMART_DIAGNOSTIC_ENGINE_VERSION) {
      return { stage: "setup", session: createSmartDiagnosticSession() };
    }
    return parsed;
  } catch {
    return { stage: "setup", session: createSmartDiagnosticSession() };
  }
}

function optionClass(option: DiagnosticOption, selected: boolean): string {
  const tones: Record<NonNullable<DiagnosticOption["tone"]>, string> = {
    positive: "border-emerald-400/30 hover:border-emerald-400/65 hover:bg-emerald-400/10",
    negative: "border-rose-400/30 hover:border-rose-400/65 hover:bg-rose-400/10",
    warning: "border-amber-400/30 hover:border-amber-400/65 hover:bg-amber-400/10",
    neutral: "border-blue-400/25 hover:border-cyan-400/55 hover:bg-cyan-400/8",
  };
  return cn(
    "group flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-slate-950/45 px-4 py-3 text-left text-sm font-medium text-slate-100 transition-all sm:text-base",
    tones[option.tone ?? "neutral"],
    selected && "border-cyan-400 bg-cyan-400/12 ring-2 ring-cyan-400/15",
  );
}

function statusTone(status: ReturnType<typeof evaluateSmartDiagnostic>["status"]) {
  if (status === "DIVERGENCIA" || status === "REVISAO_NOC") {
    return {
      className: "border-rose-400/40 bg-rose-950/30 text-rose-100",
      icon: AlertTriangle,
    };
  }
  if (status === "NORMALIZADO") {
    return {
      className: "border-emerald-400/40 bg-emerald-950/30 text-emerald-200",
      icon: CheckCircle2,
    };
  }
  if (status === "POSSIVEL_DEFEITO_ONT") {
    return {
      className: "border-amber-400/40 bg-amber-950/30 text-amber-100",
      icon: AlertTriangle,
    };
  }
  if (status === "TROCA_NAO_INDICADA") {
    return {
      className: "border-blue-400/35 bg-blue-950/35 text-blue-100",
      icon: ShieldCheck,
    };
  }
  return {
    className: "border-cyan-400/30 bg-cyan-950/20 text-cyan-100",
    icon: BrainCircuit,
  };
}

function SmartDiagnosticBetaPage() {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const [initial] = useState(loadStoredBeta);
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [session, setSession] = useState<SmartDiagnosticSession>(initial.session);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [aiReview, setAiReview] = useState<AiDiagnosticReview | null>(null);
  const [persistenceState, setPersistenceState] = useState<PersistenceState>("local");
  const [linkedChecklistId, setLinkedChecklistId] = useState<string | null>(null);

  const aiStatus = useQuery({
    queryKey: ["smart-diagnostic-ai-status"],
    queryFn: () => getSmartDiagnosticAiStatus(),
    enabled: typeof window !== "undefined",
    staleTime: 60_000,
    retry: false,
  });
  const healthMutation = useMutation({
    mutationFn: () => healthCheckSmartDiagnosticAiGateway(),
    onError: (error: Error) => toast.error(error.message),
  });
  const compareMutation = useMutation({
    mutationFn: () => compareSmartDiagnosticAiProviders({ data: { session, mode: "review" } }),
    onError: (error: Error) => toast.error(error.message),
  });
  const syncMutation = useMutation({
    mutationFn: (nextSession: SmartDiagnosticSession) =>
      syncSmartDiagnosticSession({ data: { session: nextSession } }),
    onMutate: () => setPersistenceState("saving"),
    onSuccess: (result) => {
      setPersistenceState(result.persisted ? "saved" : "migration_pending");
      if (result.persisted) setLinkedChecklistId(result.checklistId);
    },
    onError: () => setPersistenceState("error"),
  });
  const aiMutation = useMutation({
    mutationFn: ({
      nextSession,
      mode,
    }: {
      nextSession: SmartDiagnosticSession;
      mode: "triage" | "review";
    }) => runSmartDiagnosticAiReview({ data: { session: nextSession, mode } }),
    onSuccess: (result) => {
      setAiReview(result);
      setPersistenceState(
        result.persistence === "saved"
          ? "saved"
          : result.persistence === "migration_pending"
            ? "migration_pending"
            : "local",
      );
      toast.success(
        result.mode === "review" ? "Auditoria Webi NOC concluída." : "Triagem da IA concluída.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const learningMutation = useMutation({
    mutationFn: () => validateSmartDiagnosticForLearning({ data: { sessionId: session.id } }),
    onSuccess: (result) => {
      if (!result.saved) {
        toast.error(
          result.reason === "migration_pending"
            ? "A migration de auditoria ainda não foi aplicada."
            : "Sessão ainda não encontrada no banco.",
        );
        return;
      }
      toast.success(
        result.embeddingStored
          ? "Caso validado e incorporado à memória operacional."
          : "Caso validado para aprendizado; embedding ficou pendente.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const exchangeDraftMutation = useMutation({
    mutationFn: async () => {
      const operation = session.metadata.operation ?? {};
      if (!session.metadata.linkedChecklistCode.trim()) {
        throw new Error("Informe o código do checklist técnico vinculado para abrir o rascunho da troca.");
      }
      if (!evaluation.ontExchange.eligibleToRequest) {
        throw new Error("Conclua as validações técnicas antes de abrir a troca de ONT.");
      }
      if (!operation.exchangeReasons?.length) {
        throw new Error("Selecione ao menos um motivo da troca.");
      }
      if (!operation.nocProtocol?.trim()) {
        throw new Error("Cole o protocolo recebido do NOC no WhatsApp.");
      }
      return createDiagnosticOntExchangeDraft({
        data: {
          checklistCode: session.metadata.linkedChecklistCode,
          exchangeReasons: operation.exchangeReasons,
          notes: operation.exchangeNotes,
          nocProtocol: operation.nocProtocol,
          nocAnalyst: operation.nocAnalyst,
          diagnosisSummary: `Causa provável: ${evaluation.probableCause}. Validações: ${evaluation.validations.join("; ") || "não informadas"}.`,
        },
      });
    },
    onSuccess: (draft) => {
      toast.success(
        draft.resumed
          ? `Rascunho R${draft.revisionNumber} retomado.`
          : `Rascunho R${draft.revisionNumber} criado. Finalize a troca no checklist para gerar o ticket.`,
      );
      navigate({ to: "/checklists/$id", params: { id: draft.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const retestDraftMutation = useMutation({
    mutationFn: async () => {
      if (!session.metadata.linkedChecklistCode.trim()) {
        throw new Error("Informe o código do checklist técnico vinculado para criar uma nova revisão.");
      }
      return createDiagnosticRetestDraft({
        data: {
          checklistCode: session.metadata.linkedChecklistCode,
          diagnosisSummary: `Novo teste solicitado após o diagnóstico. Causa anterior: ${evaluation.probableCause}.`,
        },
      });
    },
    onSuccess: (draft) => {
      toast.success(
        draft.resumed
          ? `Rascunho R${draft.revisionNumber} retomado.`
          : `Novo teste R${draft.revisionNumber} criado sem alterar a versão anterior.`,
      );
      navigate({ to: "/checklists/$id", params: { id: draft.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const question = useMemo(() => getNextDiagnosticQuestion(session), [session]);
  const evaluation = useMemo(() => evaluateSmartDiagnostic(session), [session]);
  const progress = useMemo(() => getDiagnosticProgress(session), [session]);
  const finished = stage === "diagnosis" && question === null;
  const answeredCount = Object.keys(session.answers).length;
  const fastTrack = answeredCount >= DIAGNOSTIC_FAST_TRACK_AFTER;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SMART_DIAGNOSTIC_STORAGE_KEY,
        JSON.stringify({ stage, session } satisfies StoredBeta),
      );
    } catch {
      // A prévia continua funcional mesmo quando o navegador bloqueia armazenamento local.
    }
  }, [session, stage]);

  useEffect(() => {
    if (
      stage !== "diagnosis" ||
      session.events.length === 0 ||
      persistenceState === "migration_pending"
    ) {
      return;
    }
    const timeout = window.setTimeout(() => syncMutation.mutate(session), 900);
    return () => window.clearTimeout(timeout);
    // O snapshot é sincronizado por debounce. Estados visuais da mutation não
    // reagendam a mesma sessão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, stage]);

  useEffect(() => {
    setDraft({});
  }, [question?.id]);

  function updateMetadata(field: keyof SmartDiagnosticSession["metadata"], value: string) {
    setSession((current) => ({
      ...current,
      metadata: { ...current.metadata, [field]: value },
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateOperation(next: Partial<DiagnosticOperation>) {
    setSession((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        operation: { ...current.metadata.operation, ...next },
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setSession((current) => ({
        ...current,
        metadata: { ...current.metadata, location: { status: "unavailable" } },
      }));
      return;
    }
    const savePosition = (position: GeolocationPosition) => {
      setSession((current) => ({
        ...current,
        metadata: {
          ...current.metadata,
          location: {
            status: position.coords.accuracy <= 100 ? "captured" : "low_accuracy",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: Math.round(position.coords.accuracy),
            capturedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date().toISOString(),
      }));
    };
    const saveFailure = (status: "denied" | "unavailable") => {
      setSession((current) => ({
        ...current,
        metadata: { ...current.metadata, location: { status } },
        updatedAt: new Date().toISOString(),
      }));
    };
    const fallback = () => navigator.geolocation.getCurrentPosition(
      savePosition,
      (error) => saveFailure(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 20_000 },
    );
    navigator.geolocation.getCurrentPosition(
      savePosition,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) saveFailure("denied");
        else fallback();
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    );
  }

  function toggleSymptom(id: SymptomId) {
    setSession((current) => {
      const selected = current.symptoms.includes(id);
      return {
        ...current,
        symptoms: selected
          ? current.symptoms.filter((item) => item !== id)
          : [...current.symptoms, id],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function recordAnswer(id: string, value: DiagnosticAnswer) {
    if (!question || question.id !== id) return;
    const event = createDiagnosticDecisionEvent(question, value);
    setSession((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
      history: current.history.includes(id) ? current.history : [...current.history, id],
      events: [...current.events.filter((item) => item.questionId !== id), event],
      updatedAt: event.createdAt,
    }));
    setAiReview(null);
  }

  function undoLastAnswer() {
    const last = session.history.at(-1);
    if (!last) {
      setStage("triage");
      return;
    }
    setSession((current) => {
      const answers = { ...current.answers };
      delete answers[last];
      return {
        ...current,
        answers,
        history: current.history.slice(0, -1),
        events: current.events.filter((item) => item.questionId !== last),
        updatedAt: new Date().toISOString(),
      };
    });
    setAiReview(null);
  }

  function resetBeta() {
    const fresh = createSmartDiagnosticSession();
    setSession(fresh);
    setStage("setup");
    setAiReview(null);
    setPersistenceState("local");
    try {
      window.localStorage.removeItem(SMART_DIAGNOSTIC_STORAGE_KEY);
    } catch {
      // ignore
    }
    toast.success("Simulação reiniciada.");
  }

  function submitDraft() {
    if (!question) return;
    if (question.type === "multi") {
      const selected = (question.options ?? [])
        .filter((option) => draft[`selected_${option.value}`] === "yes")
        .map((option) => option.value);
      if (selected.length === 0) {
        toast.error("Selecione pelo menos uma ação realizada.");
        return;
      }
      recordAnswer(question.id, selected);
      return;
    }
    if (question.type === "metrics") {
      const required = ["download", "upload", "ping", "device", "connection"];
      const missing = required.some((field) => !draft[field]?.trim());
      if (missing) {
        toast.error("Preencha download, upload, ping, dispositivo e conexão utilizada.");
        return;
      }
      recordAnswer(question.id, draft);
      return;
    }
    if (question.type === "optical_metrics") {
      if (!draft.rxOnt?.trim() || !draft.source?.trim()) {
        toast.error("Informe ao menos o RX da ONT e a origem da leitura.");
        return;
      }
      const rxOnt = Number(draft.rxOnt.replace(",", "."));
      const rxOlt = draft.rxOlt?.trim() ? Number(draft.rxOlt.replace(",", ".")) : null;
      if (!Number.isFinite(rxOnt) || (rxOlt !== null && !Number.isFinite(rxOlt))) {
        toast.error("Informe os valores RX usando números válidos.");
        return;
      }
      recordAnswer(question.id, draft);
      return;
    }
    const value = draft.value?.trim();
    if (!value) {
      toast.error("Preencha a informação antes de continuar.");
      return;
    }
    recordAnswer(question.id, value);
  }

  async function downloadReport() {
    try {
      const { downloadSmartDiagnosticReport } =
        await import("@/components/smart-diagnostic/smart-diagnostic-report");
      await downloadSmartDiagnosticReport({ session, evaluation, aiReview });
      toast.success("PDF do diagnóstico gerado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    }
  }

  function runAi(mode: "triage" | "review") {
    if (!aiStatus.data?.configured) {
      toast.error("Nenhum provider de IA disponível neste ambiente.");
      return;
    }
    aiMutation.mutate({ nextSession: session, mode });
  }

  const StatusIcon = statusTone(evaluation.status).icon;

  return (
    <div className="webi-page min-h-screen">
      <header className="brand-gradient sticky top-0 z-30 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/painel"
              className="webi-icon h-10 w-10 shrink-0 rounded-xl"
              aria-label="Voltar ao painel"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <WebifibraLogo size={42} className="hidden rounded-xl sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold sm:text-base">Diagnóstico Inteligente</p>
                <Badge className="border-amber-400/40 bg-amber-400/10 text-[10px] text-amber-300 hover:bg-amber-400/10">
                  BETA
                </Badge>
              </div>
              <p className="truncate text-[11px] text-slate-400">
                NOC virtual de primeiro nível · {SMART_DIAGNOSTIC_ENGINE_VERSION}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetBeta}
            className="border-slate-600/60 bg-slate-950/35 text-slate-200"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Reiniciar teste</span>
            <span className="sm:hidden">Reiniciar</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <Alert className="rounded-2xl border-amber-400/35 bg-amber-950/20 text-amber-100">
          <FlaskConical className="h-4 w-4 text-amber-300" />
          <AlertTitle>Ambiente experimental de preview</AlertTitle>
          <AlertDescription className="text-amber-100/75">
            O diagnóstico pode consultar os providers de IA autorizados, mas não gera código TRC
            sozinho nem substitui a autorização humana do NOC. Chaves permanecem somente no servidor.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/10">
            <Bot className="mr-1.5 h-3.5 w-3.5" />
            {aiStatus.isLoading
              ? "Verificando IA"
              : aiStatus.data?.configured
                ? `IA pronta · ${aiStatus.data.triageModel}`
                : "IA não configurada"}
          </Badge>
          <Badge
            className={cn(
              "hover:bg-current/10",
              persistenceState === "saved"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : persistenceState === "migration_pending"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  : "border-slate-500/30 bg-slate-500/10 text-slate-300",
            )}
          >
            {persistenceState === "saved" ? (
              <Database className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <CloudOff className="mr-1.5 h-3.5 w-3.5" />
            )}
            {persistenceState === "saved"
              ? "Auditoria salva"
              : persistenceState === "saving"
                ? "Salvando auditoria"
                : persistenceState === "migration_pending"
                  ? "Auditoria local · rascunhos usam o checklist"
                  : "Auditoria local"}
          </Badge>
        </div>

        {stage === "setup" && (
          <SetupStep
            session={session}
            onChange={updateMetadata}
            onContinue={() => {
              if (
                !session.metadata.client.trim() ||
                !session.metadata.workOrder.trim() ||
                !session.metadata.city
              ) {
                toast.error("Informe cliente, OS e cidade para iniciar a simulação.");
                return;
              }
              captureLocation();
              setStage("triage");
            }}
          />
        )}

        {stage === "triage" && (
          <TriageStep
            session={session}
            onToggle={toggleSymptom}
            onBack={() => setStage("setup")}
            onContinue={() => {
              if (session.symptoms.length === 0) {
                toast.error("Selecione pelo menos um sintoma.");
                return;
              }
              setStage("diagnosis");
            }}
          />
        )}

        {stage === "diagnosis" && (
          <>
            <section className="webi-surface overflow-hidden p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-400">
                    Diagnóstico em curso
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    <strong className="text-white">{answeredCount}</strong> validações concluídas
                  </p>
                </div>
                <Badge className="border-blue-400/35 bg-blue-400/10 text-blue-200 hover:bg-blue-400/10">
                  {progress}% analisado
                </Badge>
                {fastTrack && (
                  <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/10">
                    Fluxo objetivo
                  </Badge>
                )}
              </div>
              <Progress
                value={progress}
                className="mt-4 h-2.5 bg-slate-950/80 [&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-cyan-400"
              />
            </section>

            <div className={cn(
              "grid gap-5",
              (!finished || user?.isAdmin) && "xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]",
            )}>
              <div className="space-y-5">
                {question ? (
                  <QuestionCard
                    question={question}
                    currentAnswer={session.answers[question.id]}
                    draft={draft}
                    onDraft={setDraft}
                    onAnswer={(value) => recordAnswer(question.id, value)}
                    onSubmit={submitDraft}
                    onBack={undoLastAnswer}
                  />
                ) : (
                  <DiagnosticSummary
                    session={session}
                    evaluation={evaluation}
                    aiReview={aiReview}
                    linkedChecklistId={linkedChecklistId}
                    onBack={undoLastAnswer}
                    onReset={resetBeta}
                    onRunReview={() => runAi("review")}
                    onDownloadReport={downloadReport}
                    onUpdateOperation={updateOperation}
                    onCreateRevision={() => retestDraftMutation.mutate()}
                    onContinueMaintenance={() => retestDraftMutation.mutate()}
                    onCaptureLocation={captureLocation}
                    onValidateLearning={() => learningMutation.mutate()}
                    canValidateLearning={Boolean(user?.isAdmin)}
                    aiPending={aiMutation.isPending}
                    learningPending={learningMutation.isPending}
                    onCreateExchangeDraft={() => exchangeDraftMutation.mutate()}
                    exchangeDraftPending={exchangeDraftMutation.isPending}
                    retestDraftPending={retestDraftMutation.isPending}
                  />
                )}
              </div>

              {(!finished || user?.isAdmin) && <aside className="space-y-4">
                {!finished && (
                  <>
                <Card className="border-blue-400/25 bg-slate-950/35">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-white">
                      <Lightbulb className="h-4 w-4 text-amber-300" />
                      Hipóteses em análise
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {evaluation.hypotheses.slice(0, 4).map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-blue-400/15 bg-slate-950/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                          <span className="text-xs font-bold text-cyan-300">{item.score}%</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.reason}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-blue-400/25 bg-slate-950/35">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-white">
                      <ClipboardCheck className="h-4 w-4 text-emerald-300" />
                      Evidências validadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evaluation.validations.length ? (
                      <ul className="space-y-2">
                        {evaluation.validations.slice(0, 7).map((item) => (
                          <li key={item} className="flex gap-2 text-sm text-slate-300">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">
                        As evidências aparecerão conforme as respostas.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {evaluation.divergences.length > 0 && (
                  <Card className="border-amber-400/35 bg-amber-950/15">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base text-white">
                        <AlertTriangle className="h-4 w-4 text-amber-300" />
                        Divergências encontradas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {evaluation.divergences.map((item) => (
                        <div
                          key={item.code}
                          className={cn(
                            "rounded-xl border p-3",
                            item.severity === "critical"
                              ? "border-rose-400/35 bg-rose-950/20"
                              : "border-amber-400/25 bg-amber-950/15",
                          )}
                        >
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-300">
                            {item.description}
                          </p>
                          <p className="mt-2 text-xs font-medium text-amber-200">
                            {item.requiredAction}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <AiAdvisorCard
                  review={aiReview}
                  configured={Boolean(aiStatus.data?.configured)}
                  loading={aiMutation.isPending}
                  finished={finished}
                  onRun={() => runAi(finished ? "review" : "triage")}
                />

                  </>
                )}

                {user?.isAdmin && (
                  <AiGatewayAdminCard
                    status={aiStatus.data}
                    results={healthMutation.data}
                    loading={healthMutation.isPending}
                    onTest={() => healthMutation.mutate()}
                    comparison={compareMutation.data}
                    comparing={compareMutation.isPending}
                    onCompare={() => compareMutation.mutate()}
                  />
                )}

                {!finished && <div
                  className={cn("rounded-2xl border p-4", statusTone(evaluation.status).className)}
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[.16em] opacity-70">
                        Estado calculado
                      </p>
                      <p className="mt-1 text-sm font-bold">{evaluation.statusLabel}</p>
                    </div>
                  </div>
                </div>}
              </aside>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SetupStep({
  session,
  onChange,
  onContinue,
}: {
  session: SmartDiagnosticSession;
  onChange: (field: keyof SmartDiagnosticSession["metadata"], value: string) => void;
  onContinue: () => void;
}) {
  return (
    <Card className="mx-auto max-w-4xl overflow-hidden border-cyan-400/30 bg-slate-950/35">
      <div className="border-b border-blue-400/20 bg-gradient-to-r from-blue-950/70 to-cyan-950/20 p-6 sm:p-8">
        <div className="webi-icon h-14 w-14 rounded-2xl">
          <BrainCircuit className="h-7 w-7" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[.2em] text-cyan-400">
          WebiCheck // Diagnóstico de manutenção
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
          Vamos diagnosticar este atendimento.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Informe os dados básicos da simulação. O sistema fará perguntas dinâmicas e eliminará
          hipóteses conforme os fatos observados.
        </p>
      </div>
      <CardContent className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Cliente</span>
          <Input
            value={session.metadata.client}
            onChange={(event) => onChange("client", event.target.value)}
            placeholder="Nome do cliente de teste"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Número da OS</span>
          <Input
            value={session.metadata.workOrder}
            onChange={(event) => onChange("workOrder", event.target.value)}
            placeholder="Ex.: 58751"
            inputMode="numeric"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Cidade</span>
          <Select value={session.metadata.city} onValueChange={(value) => onChange("city", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a cidade" />
            </SelectTrigger>
            <SelectContent>
              {PROFILE_CITIES.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-200">Modelo da ONT/equipamento</span>
          <Input
            value={session.metadata.equipmentModel}
            onChange={(event) => onChange("equipmentModel", event.target.value)}
            placeholder="Ex.: Huawei EG8145V5"
          />
        </label>
        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-semibold text-slate-200">
            Checklist técnico vinculado — opcional
          </span>
          <Input
            value={session.metadata.linkedChecklistCode}
            onChange={(event) => onChange("linkedChecklistCode", event.target.value.toUpperCase())}
            placeholder="Ex.: WEBICHECK20260045"
          />
          <span className="block text-xs text-slate-500">
            Quando a migration for homologada, o vínculo será resolvido pelo código sem alterar o
            checklist original.
          </span>
        </label>
        <div className="flex justify-end sm:col-span-2">
          <Button onClick={onContinue} size="lg" className="w-full sm:w-auto">
            Iniciar triagem
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TriageStep({
  session,
  onToggle,
  onBack,
  onContinue,
}: {
  session: SmartDiagnosticSession;
  onToggle: (id: SymptomId) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card className="border-cyan-400/30 bg-slate-950/35">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="webi-icon h-11 w-11">
              <RouteIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-400">
                Triagem inicial
              </p>
              <CardTitle className="mt-1 text-xl text-white sm:text-2xl">
                Qual problema motivou esta manutenção?
              </CardTitle>
            </div>
          </div>
          <p className="pt-2 text-sm text-slate-400">
            Selecione um ou mais sintomas. Isso define quais árvores serão abertas.
          </p>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {SYMPTOM_GROUPS.map((group) => (
          <Card key={group.id} className="border-blue-400/20 bg-slate-950/35">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-white">
                {group.id === "wifi" ? (
                  <Wifi className="h-4 w-4 text-cyan-400" />
                ) : group.id === "lan" ? (
                  <Network className="h-4 w-4 text-cyan-400" />
                ) : (
                  <Gauge className="h-4 w-4 text-cyan-400" />
                )}
                {group.label}
              </CardTitle>
              <p className="text-xs text-slate-500">{group.description}</p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {group.symptoms.map((symptom) => {
                const selected = session.symptoms.includes(symptom.id);
                return (
                  <button
                    key={symptom.id}
                    type="button"
                    onClick={() => onToggle(symptom.id)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                      selected
                        ? "border-cyan-400 bg-cyan-400/12 text-white ring-2 ring-cyan-400/10"
                        : "border-blue-400/15 bg-slate-950/35 text-slate-300 hover:border-blue-400/40 hover:bg-blue-500/8",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        selected
                          ? "border-cyan-300 bg-cyan-400 text-slate-950"
                          : "border-slate-600 bg-slate-900",
                      )}
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {symptom.label}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={onContinue} size="lg">
          Começar diagnóstico
          <Sparkles className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  currentAnswer,
  draft,
  onDraft,
  onAnswer,
  onSubmit,
  onBack,
}: {
  question: NonNullable<ReturnType<typeof getNextDiagnosticQuestion>>;
  currentAnswer: DiagnosticAnswer | undefined;
  draft: Record<string, string>;
  onDraft: (value: Record<string, string>) => void;
  onAnswer: (value: DiagnosticAnswer) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <Card className="overflow-hidden border-cyan-400/35 bg-slate-950/40 shadow-[0_24px_80px_rgba(0,80,220,.12)]">
      <CardHeader className="border-b border-blue-400/20 bg-gradient-to-br from-blue-950/75 to-slate-950/60 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <Badge className="border-cyan-400/35 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/10">
            {question.category}
          </Badge>
          <BrainCircuit className="h-5 w-5 text-blue-400" />
        </div>
        <CardTitle className="pt-3 text-xl leading-snug text-white sm:text-3xl">
          {question.prompt}
        </CardTitle>
        {question.helper && (
          <p
            className={cn(
              "pt-2 text-sm leading-relaxed",
              question.id === "retest_performed" && currentAnswer === "no"
                ? "font-medium text-amber-300"
                : "text-slate-400",
            )}
          >
            {question.helper}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-7">
        {question.evidence && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-400/15 bg-blue-950/20 px-3 py-2.5 text-xs text-slate-400">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            Evidência coletada: {question.evidence}
          </div>
        )}

        {question.type === "single" && (
          <div className="grid gap-3">
            {question.options?.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onAnswer(option.value)}
                className={optionClass(option, currentAnswer === option.value)}
              >
                <span>
                  <span className="block">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.tone === "positive" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                ) : option.tone === "negative" ? (
                  <X className="h-5 w-5 shrink-0 text-rose-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            ))}
          </div>
        )}

        {question.type === "multi" && (
          <div className="space-y-4">
            <div className="grid gap-3">
              {question.options?.map((option) => {
                const key = `selected_${option.value}`;
                const selected = draft[key] === "yes";
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (option.value === "no_action_solved" && !selected) {
                        const cleared = Object.fromEntries(
                          Object.keys(draft)
                            .filter((item) => !item.startsWith("selected_"))
                            .map((item) => [item, draft[item]]),
                        );
                        onDraft({ ...cleared, [key]: "yes" });
                        return;
                      }
                      const next = { ...draft, [key]: selected ? "no" : "yes" };
                      if (option.value !== "no_action_solved" && !selected) {
                        next.selected_no_action_solved = "no";
                      }
                      onDraft(next);
                    }}
                    className={optionClass(option, selected)}
                  >
                    <span>{option.label}</span>
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                        selected
                          ? "border-cyan-300 bg-cyan-400 text-slate-950"
                          : "border-slate-600 bg-slate-900",
                      )}
                    >
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button onClick={onSubmit} className="w-full sm:w-auto">
              Registrar ações e continuar
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {(question.type === "text" || question.type === "number") && (
          <div className="space-y-3">
            <Textarea
              value={draft.value ?? ""}
              onChange={(event) => onDraft({ value: event.target.value })}
              placeholder="Descreva o fato observado..."
              rows={5}
            />
            <Button onClick={onSubmit} className="w-full sm:w-auto">
              Registrar e continuar
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {question.type === "metrics" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {metricFields.map((field) => (
              <label key={field.id} className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">{field.label}</span>
                <Input
                  value={draft[field.id] ?? ""}
                  onChange={(event) => onDraft({ ...draft, [field.id]: event.target.value })}
                  inputMode={field.inputMode}
                />
              </label>
            ))}
            <Button onClick={onSubmit} className="sm:col-span-2">
              Registrar métricas
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {question.type === "optical_metrics" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {opticalMetricFields.map((field, index) => (
              <label
                key={field.id}
                className={cn(
                  "space-y-2",
                  index === opticalMetricFields.length - 1 && "sm:col-span-2",
                )}
              >
                <span className="text-xs font-semibold text-slate-300">{field.label}</span>
                <Input
                  value={draft[field.id] ?? ""}
                  onChange={(event) => onDraft({ ...draft, [field.id]: event.target.value })}
                  inputMode={field.id === "source" ? "text" : "decimal"}
                  placeholder={field.placeholder}
                />
              </label>
            ))}
            <Button onClick={onSubmit} className="sm:col-span-2">
              Registrar medições ópticas
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="border-t border-blue-400/15 pt-4">
          <Button variant="ghost" onClick={onBack} className="text-slate-400 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar uma validação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AiGatewayAdminCard({
  status,
  results,
  loading,
  onTest,
  comparison,
  comparing,
  onCompare,
}: {
  status: Awaited<ReturnType<typeof getSmartDiagnosticAiStatus>> | undefined;
  results: Awaited<ReturnType<typeof healthCheckSmartDiagnosticAiGateway>> | undefined;
  loading: boolean;
  onTest: () => void;
  comparison: Awaited<ReturnType<typeof compareSmartDiagnosticAiProviders>> | undefined;
  comparing: boolean;
  onCompare: () => void;
}) {
  const providers = results ?? status?.providers ?? [];
  return (
    <Card className="border-fuchsia-400/25 bg-fuchsia-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Gauge className="h-4 w-4 text-fuchsia-300" />
          IA / AI Gateway · Administrador
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-slate-400">
          Modo atual: <strong className="text-fuchsia-200">{status?.costMode ?? "free_only"}</strong>. OpenAI não é testada automaticamente.
        </p>
        <div className="space-y-2">
          {providers.map((provider) => (
            <div key={provider.provider} className="rounded-xl border border-fuchsia-400/15 bg-slate-950/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{provider.label}</p>
                <Badge className={cn(
                  "border text-[10px]",
                  provider.lastHealth?.ok
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : provider.lastHealth
                      ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                    : provider.configured
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                      : "border-slate-500/30 bg-slate-500/10 text-slate-400",
                )}>
                  {provider.lastHealth?.ok
                    ? "OK"
                    : provider.lastHealth
                      ? "Falhou"
                      : provider.configured && !provider.enabled
                        ? "Bloqueado"
                        : provider.configured
                          ? "Pendente"
                          : "Sem chave"}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-slate-400">{provider.triageModel}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {provider.costClass === "free" ? "Gratuito/configurado" : provider.costClass === "paid" ? "Pago — bloqueado por padrão" : "Custo precisa de confirmação"}
                {provider.lastHealth ? ` · ${provider.lastHealth.latencyMs} ms` : ""}
              </p>
              {provider.lastHealth?.message && <p className="mt-1 text-[11px] text-rose-200">{provider.lastHealth.message}</p>}
            </div>
          ))}
        </div>
        <Button onClick={onTest} disabled={loading} variant="outline" className="w-full border-fuchsia-400/35 text-fuchsia-100">
          {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Gauge className="mr-2 h-4 w-4" />}
          Testar providers gratuitos
        </Button>
        <Button onClick={onCompare} disabled={comparing} variant="outline" className="w-full border-blue-400/35 text-blue-100">
          {comparing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
          Comparar este caso nos modelos gratuitos
        </Button>
        {comparison && (
          <div className="space-y-2 border-t border-fuchsia-400/15 pt-3">
            {comparison.map((item) => (
              <div key={item.provider} className="rounded-lg bg-slate-950/45 p-2 text-xs text-slate-300">
                <span className="font-semibold text-white">{item.provider}</span>
                {item.success
                  ? ` · ${item.model} · ${item.latencyMs} ms · ${item.review?.confianca ?? "—"}%`
                  : ` · ${item.error}`}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NocAuthorizationPanel({
  evaluation,
  operation,
  onUpdate,
  linkedChecklistId,
  onCreateDraft,
  creatingDraft,
}: {
  evaluation: ReturnType<typeof evaluateSmartDiagnostic>;
  operation: DiagnosticOperation;
  onUpdate: (next: Partial<DiagnosticOperation>) => void;
  linkedChecklistId: string | null;
  onCreateDraft: () => void;
  creatingDraft: boolean;
}) {
  const technicalReady = evaluation.ontExchange.eligibleToRequest;
  const reasonReady = !evaluation.ontExchange.reasonsMissing;
  const protocolReady = Boolean(operation.nocProtocol?.trim());
  const authorized = operation.nocAuthorization === "authorized" && protocolReady;
  return (
    <div className="space-y-3 rounded-xl border border-cyan-400/25 bg-cyan-950/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Protocolo do NOC recebido pelo WhatsApp</p>
          <p className="text-xs text-slate-400">
            O NOC é acionado fora do Webi. Cole aqui o protocolo do atendimento autorizado; o
            Webi cria então o mesmo rascunho de troca usado pelo checklist e pelo almoxarifado.
          </p>
        </div>
        <Badge className={cn(
          "border",
          authorized ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200",
        )}>
          {authorized ? "Protocolo registrado" : "Aguardando protocolo"}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="Protocolo/OS recebido do NOC *"
          value={operation.nocProtocol ?? ""}
          onChange={(event) => onUpdate({ nocProtocol: event.target.value })}
        />
        <Input
          placeholder="Responsável que autorizou (opcional)"
          value={operation.nocAnalyst ?? ""}
          onChange={(event) => onUpdate({ nocAnalyst: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Button
          variant={authorized ? "default" : "outline"}
          disabled={!technicalReady || !reasonReady || !protocolReady || creatingDraft}
          onClick={() => {
            onUpdate({ nocAuthorization: "authorized", nocAuthorizedAt: new Date().toISOString() });
            onCreateDraft();
          }}
          className="border-emerald-400/40 text-emerald-100"
        >
          {creatingDraft ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
          Gerar rascunho da troca de ONT
        </Button>
      </div>
      {authorized && (
        <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-950/15 p-3">
          <p className="text-sm font-semibold text-emerald-100">
            Rascunho pronto para o fluxo oficial de troca
          </p>
          <p className="text-xs text-slate-300">
            O ticket/código de troca será gerado pelo fluxo atual ao finalizar a troca física no
            checklist. O protocolo <strong>{operation.nocProtocol}</strong> seguirá junto.
          </p>
          {linkedChecklistId ? (
            <Button asChild variant="outline" className="w-full border-emerald-400/35 text-emerald-100">
              <Link to="/checklists/$id" params={{ id: linkedChecklistId }}>
                Abrir checklist vinculado e executar troca
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-amber-200">Vincule um checklist técnico válido para liberar o atalho ao fluxo oficial.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AiAdvisorCard({
  review,
  configured,
  loading,
  finished,
  onRun,
}: {
  review: AiDiagnosticReview | null;
  configured: boolean;
  loading: boolean;
  finished: boolean;
  onRun: () => void;
}) {
  return (
    <Card className="overflow-hidden border-violet-400/30 bg-violet-950/15">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">
              Camada consultiva
            </p>
            <CardTitle className="mt-1 flex items-center gap-2 text-base text-white">
              <Bot className="h-4 w-4 text-violet-300" />
              Webi NOC — IA
            </CardTitle>
          </div>
          {review && (
            <Badge className="border-violet-400/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/10">
              {review.confianca}% confiança
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {review ? (
          <>
            <div className="rounded-xl border border-violet-400/20 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-500">Status consultivo</p>
              <p className="mt-1 text-sm font-bold text-violet-200">
                {review.status.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">{review.diagnostico_provavel}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{review.proxima_acao}</p>
            </div>
            {review.evidencias_faltantes.length > 0 && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-950/15 p-3">
                <p className="text-xs font-semibold text-amber-200">Evidências faltantes</p>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                  {review.evidencias_faltantes.slice(0, 4).map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>{review.model}</span>
              <span>·</span>
              <span>{review.promptVersion}</span>
              <span>·</span>
              <span>{review.memoryCasesUsed} caso(s) validado(s) consultado(s)</span>
            </div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-slate-400">
            A IA analisa o conjunto de fatos e procura contradições. As regras do WebiCheck
            continuam sendo a autoridade para bloqueios e troca de ONT.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full border-violet-400/35 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20"
          disabled={!configured || loading}
          onClick={onRun}
        >
          {loading ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <BrainCircuit className="mr-2 h-4 w-4" />
          )}
          {!configured
            ? "IA indisponível"
            : finished
              ? "Auditar atendimento com IA"
              : review
                ? "Atualizar análise da IA"
                : "Analisar estado atual com IA"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DiagnosticSummary({
  session,
  evaluation,
  aiReview,
  linkedChecklistId,
  onBack,
  onReset,
  onRunReview,
  onDownloadReport,
  onUpdateOperation,
  onCreateRevision,
  onContinueMaintenance,
  onCaptureLocation,
  onValidateLearning,
  canValidateLearning,
  aiPending,
  learningPending,
  onCreateExchangeDraft,
  exchangeDraftPending,
  retestDraftPending,
}: {
  session: SmartDiagnosticSession;
  evaluation: ReturnType<typeof evaluateSmartDiagnostic>;
  aiReview: AiDiagnosticReview | null;
  linkedChecklistId: string | null;
  onBack: () => void;
  onReset: () => void;
  onRunReview: () => void;
  onDownloadReport: () => void;
  onUpdateOperation: (next: Partial<DiagnosticOperation>) => void;
  onCreateRevision: () => void;
  onContinueMaintenance: () => void;
  onCaptureLocation: () => void;
  onValidateLearning: () => void;
  canValidateLearning: boolean;
  aiPending: boolean;
  learningPending: boolean;
  onCreateExchangeDraft: () => void;
  exchangeDraftPending: boolean;
  retestDraftPending: boolean;
}) {
  const tone = statusTone(evaluation.status);
  const Icon = tone.icon;
  const operation = session.metadata.operation ?? {};
  const canRequestExchange = evaluation.ontExchange.eligibleToRequest;
  const revision = session.metadata.revision?.revisionNumber ?? 1;
  const rootId = session.metadata.revision?.rootSessionId ?? session.id;
  const diagnosticCode = `WEBIDIAG-${rootId.slice(0, 8).toUpperCase()}-R${revision}`;
  const exchangeReasons = [
    "ONT não liga",
    "ONT reiniciando",
    "Wi-Fi 2.4 GHz defeituoso",
    "Wi-Fi 5 GHz defeituoso",
    "Portas LAN defeituosas",
    "Travamentos",
    "Perda de configuração",
    "Defeito óptico/GPON da ONT",
    "ONT queimada",
    "ONT danificada pelo cliente",
    "Outro",
  ];
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-blue-400/30 bg-slate-950/35">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Cliente", session.metadata.client || "—"],
            ["OS", session.metadata.workOrder || "—"],
            ["Cidade", session.metadata.city || "—"],
            ["Checklist", session.metadata.linkedChecklistCode || "Não vinculado"],
            ["Código do diagnóstico", diagnosticCode],
            ["Status", evaluation.statusLabel],
            ["Início", new Date(session.startedAt).toLocaleString("pt-BR")],
            [
              "Localização",
              locationDisplay(session.metadata.location),
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-blue-400/15 bg-slate-950/45 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 break-words text-sm font-semibold text-white">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className={cn("overflow-hidden border", tone.className)}>
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-current/25 bg-current/10">
              <Icon className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.2em] opacity-70">
                Resultado calculado
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-4xl">
                {evaluation.statusLabel}
              </h2>
              <p className="mt-3 text-sm opacity-80">
                Causa provável: <strong>{evaluation.probableCause}</strong>
              </p>
              {evaluation.validations.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {evaluation.validations.slice(0, 6).map((item) => (
                    <span key={item} className="rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-xs">
                      ✓ {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-cyan-400/30 bg-slate-950/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <ClipboardCheck className="h-5 w-5 text-cyan-300" />
            Decisão operacional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-300">
            O diagnóstico indica o caminho técnico; a autorização de troca permanece humana e
            vinculada às regras do NOC.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant={operation.decision === "continue_maintenance" ? "default" : "outline"}
              onClick={onContinueMaintenance}
              disabled={retestDraftPending}
            >
              {retestDraftPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continuar em novo teste
            </Button>
            <Button
              variant={operation.decision === "request_ont_exchange" ? "default" : "outline"}
              disabled={!canRequestExchange}
              onClick={() => onUpdateOperation({ decision: "request_ont_exchange" })}
              className="border-amber-400/40 text-amber-100"
            >
              Solicitar troca de ONT
            </Button>
          </div>
          {!canRequestExchange && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-950/15 p-3 text-sm text-amber-100">
              <p className="font-semibold">Ainda não apto para solicitar troca</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {evaluation.ontExchange.missingForCode.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {operation.decision === "request_ont_exchange" && (
            <div className="space-y-4 rounded-2xl border border-amber-400/30 bg-amber-950/10 p-4">
              <div>
                <p className="font-semibold text-white">Validação para troca de ONT</p>
                <p className="mt-1 text-xs text-slate-400">
                  Selecione somente os motivos verificados neste atendimento. As evidências do
                  diagnóstico são reaproveitadas.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {exchangeReasons.map((reason) => {
                  const checked = operation.exchangeReasons?.includes(reason) ?? false;
                  return (
                    <button
                      type="button"
                      key={reason}
                      onClick={() => {
                        const current = operation.exchangeReasons ?? [];
                        onUpdateOperation({
                          exchangeReasons: checked
                            ? current.filter((item) => item !== reason)
                            : [...current, reason],
                        });
                      }}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm transition",
                        checked
                          ? "border-amber-300 bg-amber-400/15 text-amber-100"
                          : "border-slate-700 bg-slate-950/40 text-slate-300",
                      )}
                    >
                      {checked ? "✓ " : "○ "}{reason}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={operation.exchangeNotes ?? ""}
                onChange={(event) => onUpdateOperation({ exchangeNotes: event.target.value })}
                placeholder="Observação técnica complementar — opcional"
                rows={3}
              />
              <div className="rounded-xl border border-blue-400/20 bg-slate-950/45 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                  Pré-validação
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                  {evaluation.ontExchange.completed.map((item) => (
                    <li key={item} className="flex gap-2"><Check className="h-4 w-4 text-emerald-400" />{item}</li>
                  ))}
                  {evaluation.ontExchange.missingForCode.map((item) => (
                    <li key={item} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" />{item}</li>
                  ))}
                </ul>
              </div>
              <NocAuthorizationPanel
                evaluation={evaluation}
                operation={operation}
                onUpdate={onUpdateOperation}
                linkedChecklistId={linkedChecklistId}
                onCreateDraft={onCreateExchangeDraft}
                creatingDraft={exchangeDraftPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-violet-400/30 bg-violet-950/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-white">
            <Bot className="h-5 w-5 text-violet-300" />
            Auditoria final Webi NOC
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiReview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-violet-400/20 bg-slate-950/45 p-3">
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-bold text-violet-200">
                    {aiReview.status.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="rounded-xl border border-violet-400/20 bg-slate-950/45 p-3">
                  <p className="text-xs text-slate-500">Confiança consultiva</p>
                  <p className="mt-1 text-lg font-black text-white">{aiReview.confianca}%</p>
                </div>
                <div className="rounded-xl border border-violet-400/20 bg-slate-950/45 p-3">
                  <p className="text-xs text-slate-500">Revisão humana</p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {aiReview.necessita_noc_humano ? "Necessária" : "Não indicada"}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-violet-400/20 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-white">{aiReview.diagnostico_provavel}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {aiReview.resumo_tecnico}
                </p>
                <p className="mt-3 text-xs font-medium text-violet-200">
                  Próxima ação: {aiReview.proxima_acao}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Provider: {aiReview.provider ?? "não informado"} · Modelo: {aiReview.model}
                  {aiReview.latencyMs ? ` · ${aiReview.latencyMs} ms` : ""}
                  {aiReview.fallbackUsed ? " · fallback gratuito usado" : ""}
                </p>
              </div>
              {aiReview.divergencias.length > 0 && (
                <div className="space-y-2">
                  {aiReview.divergencias.map((item) => (
                    <div
                      key={`${item.codigo}-${item.descricao}`}
                      className="rounded-xl border border-amber-400/30 bg-amber-950/15 p-3"
                    >
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-200">
                        {item.codigo} · {item.severidade}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">{item.descricao}</p>
                      <p className="mt-2 text-xs text-slate-400">{item.acao_corretiva}</p>
                    </div>
                  ))}
                </div>
              )}
              {aiReview.guardrailsApplied.length > 0 && (
                <Alert className="rounded-xl border-cyan-400/30 bg-cyan-950/20 text-cyan-100">
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                  <AlertTitle>Proteções aplicadas pelo WebiCheck</AlertTitle>
                  <AlertDescription className="text-cyan-100/75">
                    {aiReview.guardrailsApplied.join(" ")}
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-slate-400">
              Execute a auditoria para cruzar respostas, medições, ações e reteste antes de gerar o
              documento final.
            </p>
          )}
          <Button onClick={onRunReview} disabled={aiPending} className="w-full sm:w-auto">
            {aiPending ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BrainCircuit className="mr-2 h-4 w-4" />
            )}
            {aiReview ? "Refazer auditoria com IA" : "Executar auditoria com IA"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-blue-400/25 bg-blue-950/15">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            Hipóteses técnicas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Mais prováveis</p>
            {evaluation.hypotheses.slice(0, 4).map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-blue-400/15 bg-slate-950/40 px-3 py-2">
                <div><p className="text-sm font-semibold text-white">{item.label}</p><p className="text-xs text-slate-400">{item.reason}</p></div>
                <span className="text-sm font-black text-cyan-300">{item.score}%</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-200">Descartadas</p>
            {evaluation.eliminated.length ? (
              <ul className="space-y-2">
                {evaluation.eliminated.map((item) => (
                  <li key={item} className="flex gap-2 rounded-xl border border-blue-400/15 bg-slate-950/40 p-3 text-sm text-slate-300"><X className="h-4 w-4 shrink-0 text-blue-400" />{item}</li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-blue-400/15 bg-slate-950/40 p-3 text-sm text-slate-500">Nenhuma hipótese foi totalmente descartada.</p>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" onClick={onCaptureLocation} className="border-cyan-400/30 text-cyan-100">
          <MapPin className="mr-2 h-4 w-4" />
          Atualizar localização
        </Button>
        <Button variant="outline" onClick={onCreateRevision} disabled={retestDraftPending} className="border-blue-400/30 text-blue-100">
          {retestDraftPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ListRestart className="mr-2 h-4 w-4" />}
          Criar/retomar rascunho de novo teste
        </Button>
      </div>

      <Card className="border-emerald-400/25 bg-emerald-950/10">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-white">Contra-prova do cliente</p>
            <p className="mt-1 text-sm text-slate-400">
              Ela segue o mesmo fluxo já aprovado: finalize o rascunho do checklist de troca e
              gere a Contra-Prova na página do checklist finalizado.
            </p>
          </div>
          <p className="text-xs font-medium text-emerald-200">Sem link paralelo e sem migration extra.</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button onClick={onDownloadReport} size="lg">
          <FileDown className="mr-2 h-5 w-5" />
          Baixar PDF verificável
        </Button>
        {canValidateLearning && (
          <Button
            onClick={onValidateLearning}
            size="lg"
            variant="outline"
            disabled={!aiReview || learningPending}
            className="border-violet-400/35 bg-violet-400/10 text-violet-100"
          >
            {learningPending ? (
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <BookOpenCheck className="mr-2 h-5 w-5" />
            )}
            Validar caso para aprendizado
          </Button>
        )}
      </div>

      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Revisar última resposta
        </Button>
        <Button variant="secondary" onClick={onReset}>
          <ListRestart className="mr-2 h-4 w-4" />
          Nova simulação
        </Button>
      </div>
    </div>
  );
}
