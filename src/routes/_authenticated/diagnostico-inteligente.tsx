import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  ClipboardCheck,
  ClipboardCopy,
  FlaskConical,
  Gauge,
  Lightbulb,
  ListRestart,
  LockKeyhole,
  MessageCircle,
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
  buildNocWhatsAppPreview,
  createSmartDiagnosticSession,
  evaluateSmartDiagnostic,
  getDiagnosticProgress,
  getNextDiagnosticQuestion,
  SMART_DIAGNOSTIC_ENGINE_VERSION,
  SMART_DIAGNOSTIC_STORAGE_KEY,
  SYMPTOM_GROUPS,
  type DiagnosticAnswer,
  type DiagnosticOption,
  type SmartDiagnosticSession,
  type SymptomId,
} from "@/lib/smart-diagnostic";
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
  const [initial] = useState(loadStoredBeta);
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [session, setSession] = useState<SmartDiagnosticSession>(initial.session);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [nocPreviewOpen, setNocPreviewOpen] = useState(false);

  const question = useMemo(() => getNextDiagnosticQuestion(session), [session]);
  const evaluation = useMemo(() => evaluateSmartDiagnostic(session), [session]);
  const progress = useMemo(() => getDiagnosticProgress(session), [session]);
  const finished = stage === "diagnosis" && question === null;
  const answeredCount = Object.keys(session.answers).length;

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
    setDraft({});
  }, [question?.id]);

  function updateMetadata(field: keyof SmartDiagnosticSession["metadata"], value: string) {
    setSession((current) => ({
      ...current,
      metadata: { ...current.metadata, [field]: value },
      updatedAt: new Date().toISOString(),
    }));
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
    setSession((current) => ({
      ...current,
      answers: { ...current.answers, [id]: value },
      history: current.history.includes(id) ? current.history : [...current.history, id],
      updatedAt: new Date().toISOString(),
    }));
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
        updatedAt: new Date().toISOString(),
      };
    });
    setNocPreviewOpen(false);
  }

  function resetBeta() {
    const fresh = createSmartDiagnosticSession();
    setSession(fresh);
    setStage("setup");
    setNocPreviewOpen(false);
    try {
      window.localStorage.removeItem(SMART_DIAGNOSTIC_STORAGE_KEY);
    } catch {
      // ignore
    }
    toast.success("Simulação reiniciada.");
  }

  function submitDraft() {
    if (!question) return;
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
    const value = draft.value?.trim();
    if (!value) {
      toast.error("Preencha a informação antes de continuar.");
      return;
    }
    recordAnswer(question.id, value);
  }

  async function copyNocPreview() {
    const text = buildNocWhatsAppPreview(session, evaluation, user?.full_name ?? "");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem de teste copiada.");
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }

  const nocPreview = buildNocWhatsAppPreview(session, evaluation, user?.full_name ?? "");
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
          <AlertTitle>Ambiente de simulação</AlertTitle>
          <AlertDescription className="text-amber-100/75">
            Os dados ficam somente neste navegador. Nenhum checklist, código TRC, solicitação NOC ou
            registro no banco será criado.
          </AlertDescription>
        </Alert>

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
              </div>
              <Progress
                value={progress}
                className="mt-4 h-2.5 bg-slate-950/80 [&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-cyan-400"
              />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
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
                    nocPreviewOpen={nocPreviewOpen}
                    nocPreview={nocPreview}
                    onToggleNocPreview={() => setNocPreviewOpen((current) => !current)}
                    onCopyNocPreview={copyNocPreview}
                    onBack={undoLastAnswer}
                    onReset={resetBeta}
                  />
                )}
              </div>

              <aside className="space-y-4">
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

                <div
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
                </div>
              </aside>
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
        <label className="space-y-2 sm:col-span-2">
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

function DiagnosticSummary({
  session,
  evaluation,
  nocPreviewOpen,
  nocPreview,
  onToggleNocPreview,
  onCopyNocPreview,
  onBack,
  onReset,
}: {
  session: SmartDiagnosticSession;
  evaluation: ReturnType<typeof evaluateSmartDiagnostic>;
  nocPreviewOpen: boolean;
  nocPreview: string;
  onToggleNocPreview: () => void;
  onCopyNocPreview: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const tone = statusTone(evaluation.status);
  const Icon = tone.icon;
  return (
    <div className="space-y-5">
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
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-emerald-400/25 bg-emerald-950/15">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Validações realizadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {evaluation.validations.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="border-blue-400/25 bg-blue-950/15">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <CircleSlash2 className="h-4 w-4 text-blue-400" />
              Hipóteses descartadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evaluation.eliminated.length ? (
              <ul className="space-y-2">
                {evaluation.eliminated.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-300">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma hipótese foi totalmente descartada.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card
        className={cn(
          "border",
          evaluation.noc.eligible
            ? "border-emerald-400/45 bg-emerald-950/20"
            : "border-amber-400/35 bg-amber-950/15",
        )}
      >
        <CardHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                evaluation.noc.eligible
                  ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300"
                  : "border-amber-400/35 bg-amber-400/10 text-amber-300",
              )}
            >
              {evaluation.noc.eligible ? (
                <MessageCircle className="h-5 w-5" />
              ) : (
                <LockKeyhole className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-400">
                Simulação de autorização NOC
              </p>
              <CardTitle className="mt-1 text-lg text-white">{evaluation.noc.title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {evaluation.noc.completed.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Concluído
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {evaluation.noc.completed.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.noc.missing.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                Solicitação bloqueada — falta concluir
              </p>
              <ul className="space-y-2">
                {evaluation.noc.missing.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {evaluation.noc.eligible && (
            <>
              <Alert className="rounded-xl border-cyan-400/30 bg-cyan-950/20 text-cyan-100">
                <FlaskConical className="h-4 w-4 text-cyan-300" />
                <AlertTitle>Somente simulação</AlertTitle>
                <AlertDescription className="text-cyan-100/75">
                  O botão abaixo apenas monta a mensagem. Ele não abre o WhatsApp, não solicita
                  autorização e não gera código TRC.
                </AlertDescription>
              </Alert>
              <Button onClick={onToggleNocPreview} size="lg" className="w-full">
                <MessageCircle className="mr-2 h-5 w-5" />
                {nocPreviewOpen ? "Ocultar mensagem de teste" : "Simular solicitação ao NOC"}
              </Button>
            </>
          )}

          {nocPreviewOpen && evaluation.noc.eligible && (
            <div className="space-y-3 rounded-2xl border border-blue-400/25 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Prévia da mensagem</p>
                <Button variant="outline" size="sm" onClick={onCopyNocPreview}>
                  <ClipboardCopy className="mr-1.5 h-4 w-4" />
                  Copiar
                </Button>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/25 p-4 font-sans text-xs leading-relaxed text-slate-300">
                {nocPreview}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-blue-400/20 bg-slate-950/35">
        <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-3">
          <div>
            <p className="text-slate-500">Cliente</p>
            <p className="mt-1 font-semibold text-white">{session.metadata.client}</p>
          </div>
          <div>
            <p className="text-slate-500">OS</p>
            <p className="mt-1 font-semibold text-white">{session.metadata.workOrder}</p>
          </div>
          <div>
            <p className="text-slate-500">Cidade</p>
            <p className="mt-1 font-semibold text-white">{session.metadata.city}</p>
          </div>
        </CardContent>
      </Card>

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
