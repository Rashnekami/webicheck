import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileUp,
  Loader2,
  LockKeyhole,
  Network,
  Search,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { CheckTecnicoMark } from "@/components/checktecnico-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  SIGNAL_CAUSES,
  SIGNAL_CITIES,
  causeLabel,
  causeNeedsInfra,
  importSignalAudit,
  isSignalCritical,
  isSignalProblem,
  issueLabel,
  listSignalCases,
  listSignalEvents,
  listSignalImports,
  mergeSignalPreviews,
  parseSmartOltCsv,
  summarizeSignalCities,
  summarizeSignalCity,
  updateSignalCase,
  type SignalCase,
  type SignalCause,
  type SignalCity,
  type SignalCsvPreview,
  type SignalIssueKind,
  type SignalStatus,
} from "@/lib/signal-audit";
import { listSignalCampaigns, lockSignalCampaign } from "@/lib/signal-campaigns";

import {
  listSignalAiAnalyses,
  listSignalTechnicians,
  runSignalAiAnalysis,
} from "@/lib/signal-audit.functions";

export const Route = createFileRoute("/_authenticated/sinais")({
  head: () => ({
    meta: [{ title: "Painel de sinais — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: SignalAudit,
});

const STATUS_LABELS: Record<SignalStatus, string> = {
  aberto: "Backlog",
  em_andamento: "Em OS",
  encerrado: "Encerrado",
};
const STATUS_COLORS: Record<SignalStatus, string> = {
  aberto: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  em_andamento: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  encerrado: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};
const CHART_COLORS = ["#1a53ff", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"];
const PAGE_SIZE = 10;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
function toOptionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function SignalAudit() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [importCity, setImportCity] = useState<SignalCity>("Telêmaco Borba");
  const [preview, setPreview] = useState<SignalCsvPreview | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [readingFile, setReadingFile] = useState(false);

  const [search, setSearch] = useState("");
  const [city, setCity] = useState<"todas" | SignalCity>("Telêmaco Borba");
  const [board, setBoard] = useState("todas");
  const [status, setStatus] = useState<"todos" | SignalStatus>("todos");
  const [issue, setIssue] = useState<"todos" | SignalIssueKind>("todos");
  const [baseState, setBaseState] = useState<"atuais" | "normalizados" | "todos">("atuais");
  const [boardCity, setBoardCity] = useState<"todas" | SignalCity>("todas");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<SignalCase | null>(null);
  const [draftStatus, setDraftStatus] = useState<SignalStatus>("em_andamento");
  const [draftCause, setDraftCause] = useState<SignalCause | "">("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftOs, setDraftOs] = useState("");
  const [draftTechnicianId, setDraftTechnicianId] = useState("");
  const [draftFinal1310, setDraftFinal1310] = useState("");
  const [draftFinal1490, setDraftFinal1490] = useState("");

  useEffect(() => {
    if (!userLoading && user && !user.isAdmin) navigate({ to: "/painel", replace: true });
  }, [user, userLoading, navigate]);

  const importsQuery = useQuery({
    queryKey: ["signal-imports"],
    queryFn: listSignalImports,
    enabled: !!user?.isAdmin,
  });
  const casesQuery = useQuery({
    queryKey: ["signal-cases"],
    queryFn: listSignalCases,
    enabled: !!user?.isAdmin,
  });
  const campaignsQuery = useQuery({
    queryKey: ["signal-campaigns"],
    queryFn: listSignalCampaigns,
    enabled: !!user?.isAdmin,
  });
  const techniciansQuery = useQuery({
    queryKey: ["signal-technicians"],
    queryFn: () => listSignalTechnicians(),
    enabled: !!user?.isAdmin,
  });
  const aiQuery = useQuery({
    queryKey: ["signal-ai"],
    queryFn: () => listSignalAiAnalyses(),
    enabled: !!user?.isAdmin,
  });
  const eventsQuery = useQuery({
    queryKey: ["signal-events", "30d"],
    queryFn: () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      since.setHours(0, 0, 0, 0);
      return listSignalEvents(since.toISOString());
    },
    enabled: !!user?.isAdmin,
  });

  const importMutation = useMutation({
    mutationFn: () => importSignalAudit({ city: importCity, sourceName, preview: preview! }),
    onSuccess: async () => {
      setPreview(null);
      setSourceName("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["signal-imports"] }),
        queryClient.invalidateQueries({ queryKey: ["signal-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["signal-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["signal-campaign-cases"] }),
      ]);
      toast.success(`Placa/lote de ${importCity} incorporado ao backlog.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao importar."),
  });

  const updateMutation = useMutation({
    mutationFn: updateSignalCase,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["signal-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["signal-events"] }),
      ]);
      setEditing(null);
      // Ao abrir/manter uma OS, leva o usuário direto para a aba das OS.
      if (variables.status === "em_andamento") {
        setStatus("em_andamento");
        setPage(1);
        toast.success("OS aberta. Ela está na aba OS em andamento.");
        return;
      }
      if (variables.status === "encerrado") {
        setStatus("encerrado");
        setPage(1);
      }
      toast.success("Controle da OS atualizado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao atualizar."),
  });


  const lockCampaignMutation = useMutation({
    mutationFn: lockSignalCampaign,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signal-campaigns"] });
      toast.success("Baseline congelado. Novas leituras não alterarão o total inicial da campanha.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao congelar baseline."),
  });

  const aiMutation = useMutation({
    mutationFn: () => runSignalAiAnalysis({ data: { city: city === "todas" ? null : city } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signal-ai"] });
      toast.success("Análise de causas atualizada.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na análise por IA."),
  });

  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data]);
  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);
  const current = useMemo(() => cases.filter((item) => item.present_in_latest_import), [cases]);

  const grCity = city === "todas" ? "Telêmaco Borba" : city;
  const grTitle = city === "todas" ? "Telêmaco Borba e região" : city;
  const activeCampaign = useMemo(
    () => campaigns.find((item) => item.city === grCity && item.status !== "closed") ?? null,
    [campaigns, grCity],
  );

  // Base consolidada: todos os casos conhecidos da cidade, sem depender do
  // limite de 1000 linhas do PostgREST nem apenas do último lote importado.
  const citySummaries = useMemo(() => summarizeSignalCities(cases), [cases]);
  const gr = useMemo(() => {
    // "Todas as cidades" consolida Telêmaco Borba e região somando cada cidade.
    const scoped = city === "todas" ? cases : cases.filter((item) => item.city === city);
    const summary =
      city === "todas"
        ? citySummaries.reduce(
            (acc, item) => ({
              city: "Telêmaco Borba e região",
              plates: acc.plates + item.plates,
              baseline: acc.baseline + item.baseline,
              problemsNow: acc.problemsNow + item.problemsNow,
              criticalNow: acc.criticalNow + item.criticalNow,
              criticalPending: acc.criticalPending + item.criticalPending,
              inProgress: acc.inProgress + item.inProgress,
              closed: acc.closed + item.closed,
              normalized: acc.normalized + item.normalized,
            }),
            {
              city: "Telêmaco Borba e região",
              plates: 0,
              baseline: 0,
              problemsNow: 0,
              criticalNow: 0,
              criticalPending: 0,
              inProgress: 0,
              closed: 0,
              normalized: 0,
            },
          )
        : summarizeSignalCity(cases, city);
    const infra = scoped.filter(
      (item) => item.status !== "encerrado" && causeNeedsInfra(item.cause),
    ).length;
    return {
      ...summary,
      infra,
      progress: summary.baseline ? Math.round((summary.closed / summary.baseline) * 1000) / 10 : 0,
    };
  }, [cases, city, citySummaries]);

  // Com "Todas as cidades" a evolução mostra as placas de todas as cidades,
  // não apenas as de Telêmaco Borba.
  const boardStats = useMemo(() => {
    const grouped = new Map<
      string,
      { city: string; board: string; baseline: number; closed: number; current: number; critical: number; normalized: number }
    >();
    for (const item of cases) {
      if (boardCity !== "todas" && item.city !== boardCity) continue;
      const board = (item.board || "").trim() || "—";
      const key = `${item.city}|${board}`;
      const row =
        grouped.get(key) ?? { city: item.city, board, baseline: 0, closed: 0, current: 0, critical: 0, normalized: 0 };
      row.baseline += 1;
      if (item.status === "encerrado") row.closed += 1;
      if (item.present_in_latest_import) row.current += 1;
      else row.normalized += 1;
      if (item.present_in_latest_import && item.status !== "encerrado" && isSignalCritical(item)) {
        row.critical += 1;
      }
      grouped.set(key, row);
    }
    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        progress: item.baseline ? Math.round((item.closed / item.baseline) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.city.localeCompare(b.city, "pt-BR") || Number(a.board) - Number(b.board));
  }, [cases, boardCity]);


  const availableBoards = useMemo(
    () => Array.from(new Set(cases.filter((item) => city === "todas" || item.city === city).map((item) => item.board).filter(Boolean))).sort((a, b) => Number(a) - Number(b)),
    [cases, city],
  );

  const totals = useMemo(() => {
    const scope = city === "todas" ? current : current.filter((item) => item.city === city);
    const problems = scope.filter((item) => isSignalProblem(item));
    const historic = city === "todas" ? cases : cases.filter((item) => item.city === city);
    return {
      baseline: historic.length,
      current: problems.length,
      critical: problems.filter((item) => isSignalCritical(item)).length,
      criticalPending: problems.filter((item) => isSignalCritical(item) && item.status !== "encerrado").length,
      imbalance: problems.filter((item) => item.difference_db > 3).length,
      low: problems.filter((item) => item.signal_1310 <= -25 || item.signal_1490 <= -25).length,
      infra: historic.filter((item) => item.status !== "encerrado" && causeNeedsInfra(item.cause)).length,
      closed: historic.filter((item) => item.status === "encerrado").length,
    };
  }, [cases, current, city]);


  const causes = useMemo(() => {
    const counts = new Map<string, number>();
    cases
      .filter((item) => item.status === "encerrado" && item.cause)
      .forEach((item) => {
        const name = causeLabel(item.cause);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
    return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [cases]);

  const daily = useMemo(() => {
    const days: Array<{ key: string; label: string; imported: number; closed: number }> = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
        imported: 0,
        closed: 0,
      });
    }
    const map = new Map(days.map((item) => [item.key, item]));
    (importsQuery.data ?? []).forEach((item) => {
      const day = map.get(item.created_at.slice(0, 10));
      if (day) day.imported += item.flagged_row_count;
    });
    (eventsQuery.data ?? [])
      .filter((item) => item.status === "encerrado")
      .forEach((item) => {
        const day = map.get(item.created_at.slice(0, 10));
        if (day) day.closed += 1;
      });
    return days;
  }, [eventsQuery.data, importsQuery.data]);

  const segmentCounts = useMemo(() => {
    const scoped = cases.filter(
      (item) => (city === "todas" || item.city === city) && (board === "todas" || item.board === board),
    );
    return {
      aberto: scoped.filter((item) => item.status === "aberto").length,
      em_andamento: scoped.filter((item) => item.status === "em_andamento").length,
      encerrado: scoped.filter((item) => item.status === "encerrado").length,
    };
  }, [cases, city, board]);

  const osBoard = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    const scoped = cases.filter((item) => {
      if (city !== "todas" && item.city !== city) return false;
      if (board !== "todas" && item.board !== board) return false;
      if (!needle) return true;
      return [item.customer_name, item.sn, item.olt, item.board, item.port, item.hubsoft_os]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
    });
    const bySeverity = (a: SignalCase, b: SignalCase) =>
      a.severity !== b.severity ? (a.severity === "critico" ? -1 : 1) : b.difference_db - a.difference_db;
    const byUpdated = (a: SignalCase, b: SignalCase) =>
      new Date(b.closed_at ?? b.updated_at).getTime() - new Date(a.closed_at ?? a.updated_at).getTime();
    return {
      aberto: scoped.filter((item) => item.status === "aberto" && item.present_in_latest_import).sort(bySeverity),
      em_andamento: scoped.filter((item) => item.status === "em_andamento").sort(bySeverity),
      encerrado: scoped.filter((item) => item.status === "encerrado").sort(byUpdated),
    };
  }, [cases, city, board, search]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return cases
      .filter((item) => {
        if (city !== "todas" && item.city !== city) return false;
        if (board !== "todas" && item.board !== board) return false;
        if (status !== "todos" && item.status !== status) return false;
        if (issue !== "todos" && item.issue_kind !== issue) return false;
        // "Ruins agora"/"Normalizados" descrevem apenas triagem do backlog.
        // OS em andamento e encerradas nunca somem por causa da coleta.
        if (item.status === "aberto") {
          if (baseState === "atuais" && !item.present_in_latest_import) return false;
          if (baseState === "normalizados" && item.present_in_latest_import) return false;
        }
        if (!needle) return true;
        return [item.customer_name, item.sn, item.olt, item.board, item.port, item.zone, item.odb, item.hubsoft_os]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
      })
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "critico" ? -1 : 1;
        const boardDiff = Number(a.board || 999) - Number(b.board || 999);
        if (boardDiff) return boardDiff;
        const portDiff = Number(a.port || 999) - Number(b.port || 999);
        if (portDiff) return portDiff;
        return b.difference_db - a.difference_db;
      });
  }, [cases, city, board, status, issue, baseState, search]);

  useEffect(() => setPage(1), [city, board, status, issue, baseState, search]);
  useEffect(() => setBoard("todas"), [city]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setReadingFile(true);
    try {
      const selected = Array.from(files);
      const previews = await Promise.all(
        selected.map(async (file) => parseSmartOltCsv(await file.text(), { city: importCity, sourceFile: file.name })),
      );
      const merged = mergeSignalPreviews(previews, importCity);
      setPreview(merged);
      setSourceName(`${importCity} · ${selected.length} placa${selected.length === 1 ? "" : "s"}`);
      toast.success(`${merged.rows.length.toLocaleString("pt-BR")} casos entram no backlog em ${selected.length} arquivo(s).`);
    } catch (error) {
      setPreview(null);
      toast.error(error instanceof Error ? error.message : "CSV inválido.");
    } finally {
      setReadingFile(false);
    }
  }

  function openCase(item: SignalCase) {
    setEditing(item);
    setDraftStatus(item.status === "aberto" ? "em_andamento" : item.status);
    setDraftCause(item.cause ?? "");
    setDraftNotes(item.notes ?? "");
    setDraftOs(item.hubsoft_os ?? "");
    setDraftTechnicianId(item.assigned_technician_id ?? "");
    setDraftFinal1310(item.final_signal_1310?.toString() ?? "");
    setDraftFinal1490(item.final_signal_1490?.toString() ?? "");
  }

  if (userLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><CheckTecnicoMark size={64} className="animate-pulse" /></div>;
  }
  if (!user.isAdmin) return null;

  const dataError = importsQuery.error || casesQuery.error || campaignsQuery.error;
  const latestAi = aiQuery.data?.[0];

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/painel" className="rounded-full bg-white/15 p-2 hover:bg-white/25" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <CheckTecnicoMark size={40} />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">CheckTecnico · gestão preventiva</p>
              <h1 className="text-lg font-semibold">Painel de sinais</h1>
            </div>
          </div>
          <Badge className="bg-white/20 text-white hover:bg-white/20"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Gestão</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <Card className="overflow-hidden border-primary/30 shadow-sm">
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
              <div className="brand-gradient p-6 text-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Campanha de recuperação óptica</p>
                    <h2 className="mt-1 text-2xl font-bold">{grTitle}</h2>
                  </div>
                  <Badge className="bg-white/20 text-white hover:bg-white/20">
                    {activeCampaign?.status === "building" ? "Baseline em formação" : activeCampaign ? "Baseline congelado" : "Aguardando 1ª placa"}
                  </Badge>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <HeroNumber label="Baseline consolidada" value={gr.baseline} />
                  <HeroNumber label="Encerrados" value={gr.closed} />
                  <HeroNumber label="Em OS" value={gr.inProgress} />
                  <HeroNumber label="Avanço" value={pct(gr.progress)} />
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.min(gr.progress, 100)}%` }} />
                </div>
                <p className="mt-2 text-sm opacity-85">
                  Baseline = todos os clientes com estado óptico conhecido nas placas já monitoradas. Novas coletas atualizam a condição atual sem apagar o histórico.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-2">
                <ImpactCell label="Críticos pendentes" value={gr.criticalPending} tone="danger" />
                <ImpactCell label="Normalizados na coleta" value={gr.normalized} tone="success" />
                <ImpactCell label="Infra / rede" value={gr.infra} tone="infra" />
                <ImpactCell label="Placas monitoradas" value={gr.plates} />
              </div>
            </div>
            {activeCampaign?.status === "building" && boardStats.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm">
                <span className="text-muted-foreground">Carregue as placas 1→7. Só congele quando a primeira varredura de Telêmaco estiver completa.</span>
                <Button variant="outline" size="sm" disabled={lockCampaignMutation.isPending} onClick={() => lockCampaignMutation.mutate(activeCampaign.id)}>
                  <LockKeyhole className="mr-2 h-4 w-4" /> Congelar baseline
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Baseline consolidada" value={totals.baseline} icon={ShieldCheck} />
          <MetricCard label="Clientes com problema agora" value={totals.current} icon={Activity} />
          <MetricCard label="Críticos agora" value={totals.critical} icon={AlertTriangle} tone="danger" />
          <MetricCard label="Críticos pendentes" value={totals.criticalPending} icon={CircleDot} tone="danger" />
          <MetricCard label="Infra pendente" value={totals.infra} icon={Network} tone="infra" />
          <MetricCard label="Encerrados total" value={totals.closed} icon={CheckCircle2} tone="success" />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" /> Resumo por cidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Placas monitoradas</TableHead>
                    <TableHead>Baseline consolidada</TableHead>
                    <TableHead>Com problema agora</TableHead>
                    <TableHead>Críticos agora</TableHead>
                    <TableHead>Críticos pendentes</TableHead>
                    <TableHead>Em andamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {citySummaries.map((item) => (
                    <TableRow key={item.city}>
                      <TableCell className="font-semibold">{item.city}</TableCell>
                      <TableCell>{item.plates === 1 ? "1 placa monitorada" : `${item.plates} placas monitoradas`}</TableCell>
                      <TableCell>{item.baseline.toLocaleString("pt-BR")}</TableCell>
                      <TableCell>{item.problemsNow.toLocaleString("pt-BR")}</TableCell>
                      <TableCell>{item.criticalNow.toLocaleString("pt-BR")}</TableCell>
                      <TableCell>
                        <Badge variant={item.criticalPending ? "destructive" : "secondary"}>{item.criticalPending}</Badge>
                      </TableCell>
                      <TableCell>{item.inProgress.toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>


        <Card className="border-primary/20">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="font-semibold">Importar placa(s) do SmartOLT</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Entram no backlog clientes com <strong>1490 ≤ -25 dBm</strong> ou diferença absoluta <strong>&gt; 3 dB</strong> entre 1310/1490. O 1310 isoladamente não gera caso.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={importCity} onValueChange={(value) => { setImportCity(value as SignalCity); setPreview(null); }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{SIGNAL_CITIES.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
              </Select>
              <Label htmlFor="signal-csv" className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent">
                {readingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                Selecionar CSVs/placas
              </Label>
              <Input id="signal-csv" type="file" multiple accept=".csv,text/csv" className="sr-only" onChange={(event) => void handleFiles(event.target.files)} />
              {preview && (
                <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Incorporar {preview.rows.length.toLocaleString("pt-BR")} ao backlog
                </Button>
              )}
            </div>
            {preview && (
              <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                <span><strong>{preview.sourceFiles.length}</strong> arquivo(s)</span>
                <span><strong>{preview.validRows.toLocaleString("pt-BR")}</strong> ONUs válidas</span>
                <span><strong>{preview.rows.length.toLocaleString("pt-BR")}</strong> casos</span>
                <span><strong>{preview.ponStats.filter((item) => item.infra_suspect).length}</strong> PONs em alerta</span>
              </div>
            )}
          </CardContent>
        </Card>

        {dataError ? (
          <Card className="border-destructive/30"><CardContent className="py-10 text-center"><p className="font-medium text-destructive">Não foi possível carregar o Painel de Sinais.</p><p className="mt-1 text-sm text-muted-foreground">Atualize a página; se persistir, revise o schema e as permissões do módulo.</p></CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" /> Evolução por placa — {city === "todas" ? "todas as cidades" : city}</CardTitle></CardHeader>
              <CardContent>
                {boardStats.length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader><TableRow><TableHead>Cidade</TableHead><TableHead>Placa</TableHead><TableHead>Baseline</TableHead><TableHead>Críticos pendentes</TableHead><TableHead>Normalizados</TableHead><TableHead>Encerrados</TableHead><TableHead>Avanço</TableHead></TableRow></TableHeader>
                      <TableBody>{boardStats.map((item) => (
                        <TableRow key={`${item.city}-${item.board}`}>
                          <TableCell className="font-medium">{item.city}</TableCell>
                          <TableCell className="font-semibold">Placa {item.board}</TableCell>
                          <TableCell>{item.baseline}</TableCell>
                          <TableCell><Badge variant={item.critical ? "destructive" : "secondary"}>{item.critical}</Badge></TableCell>
                          <TableCell>{item.normalized}</TableCell>
                          <TableCell>{item.closed}</TableCell>
                          <TableCell className="min-w-44"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(item.progress, 100)}%` }} /></div><strong>{pct(item.progress)}</strong></div></TableCell>
                        </TableRow>
                      ))}</TableBody>

                    </Table>
                  </div>
                ) : <p className="py-8 text-center text-sm text-muted-foreground">A evolução por placa aparecerá a partir da primeira importação.</p>}
              </CardContent>
            </Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Movimento da campanha — 14 dias</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ left: -20, right: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} /><Tooltip /><Bar dataKey="imported" name="Casos identificados" fill="#93c5fd" radius={[4,4,0,0]} /><Bar dataKey="closed" name="Encerrados" fill="#22c55e" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Causas confirmadas</CardTitle></CardHeader>
                <CardContent className="h-72">
                  {causes.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={causes} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={2}>{causes.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">As causas aparecerão conforme as OS forem encerradas.</div>}
                </CardContent>
              </Card>
            </section>

            <Card className="border-violet-200">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-5 w-5 text-violet-600" /> Análise de causas por IA</CardTitle><p className="mt-1 text-sm text-muted-foreground">Cruza causas confirmadas com concentração por OLT/placa/PON e sugere investigação de infraestrutura sem inventar causa individual.</p></div>
                <Button variant="outline" onClick={() => aiMutation.mutate()} disabled={aiMutation.isPending}>{aiMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Analisar {city === "todas" ? "provedor" : city}</Button>
              </CardHeader>
              <CardContent>
                {latestAi ? <div className="space-y-3 text-sm"><p>{latestAi.resumo}</p>{latestAi.principais_motivos.length > 0 && <div><strong>Principais motivos:</strong><ul className="mt-1 list-disc pl-5">{latestAi.principais_motivos.slice(0,5).map((item) => <li key={item.causa}>{item.causa}: {item.quantidade} ({pct(item.percentual)}) — {item.leitura}</li>)}</ul></div>}{latestAi.infraestrutura_prioritaria.length > 0 && <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-orange-900"><strong>Infraestrutura prioritária</strong><ul className="mt-1 list-disc pl-5">{latestAi.infraestrutura_prioritaria.slice(0,5).map((item,index) => <li key={`${item.cidade}-${index}`}>{item.cidade} · {item.olt || "OLT —"} · placa {item.placa || "—"} · PON {item.pon || "—"}: {item.casos} caso(s) — {item.motivo}</li>)}</ul></div>}<p className="text-xs text-muted-foreground">{formatDate(latestAi.created_at)} · {latestAi.model}</p></div> : <p className="text-sm text-muted-foreground">A IA ganha precisão conforme as OS são encerradas e as causas reais são registradas.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quadro de OS</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clique em um cartão para lançar as informações e encerrar. Ao encerrar, o cliente vai para a coluna verde e entra na lista de atendimentos concluídos.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                {([
                  { key: "aberto" as const, title: "Em aberto", tone: "amber" as const, items: osBoard.aberto },
                  { key: "em_andamento" as const, title: "Em andamento", tone: "blue" as const, items: osBoard.em_andamento },
                  { key: "encerrado" as const, title: "Encerradas", tone: "emerald" as const, items: osBoard.encerrado },
                ]).map((column) => (
                  <div key={column.key} className="rounded-xl border bg-muted/30 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">{column.title}</p>
                      <Badge variant="secondary">{column.items.length.toLocaleString("pt-BR")}</Badge>
                    </div>
                    <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
                      {column.items.length ? (
                        column.items.slice(0, 24).map((item) => (
                          <OsStickyCard key={item.id} item={item} tone={column.tone} onClick={() => openCase(item)} />
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                          Nenhum caso nesta coluna.
                        </p>
                      )}
                      {column.items.length > 24 && (
                        <p className="text-center text-xs text-muted-foreground">
                          + {(column.items.length - 24).toLocaleString("pt-BR")} na listagem abaixo
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-emerald-200">
              <CardHeader>
                <CardTitle className="text-base text-emerald-700">Clientes com OS encerrada</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Lista construída conforme as OS vão sendo encerradas.</p>
              </CardHeader>
              <CardContent>
                {osBoard.encerrado.length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader><TableRow><TableHead>Cliente / SN</TableHead><TableHead>Cidade / rede</TableHead><TableHead>OS</TableHead><TableHead>Causa</TableHead><TableHead>Técnico</TableHead><TableHead>Encerrada em</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {osBoard.encerrado.slice(0, 50).map((item) => (
                          <TableRow key={item.id} className="bg-emerald-50/70 hover:bg-emerald-100/60">
                            <TableCell><p className="font-medium">{item.customer_name}</p><p className="text-xs text-muted-foreground">SN {item.sn}</p></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.city} · placa {item.board || "—"} · PON {item.port || "—"}</TableCell>
                            <TableCell>{item.hubsoft_os ? `OS ${item.hubsoft_os}` : "—"}</TableCell>
                            <TableCell>{item.cause ? causeLabel(item.cause) : "—"}</TableCell>
                            <TableCell>{item.assigned_technician_name || "—"}</TableCell>
                            <TableCell className="text-xs">{formatDate(item.closed_at ?? item.updated_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma OS encerrada ainda com os filtros atuais.</p>
                )}
              </CardContent>
            </Card>


            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><CardTitle>Backlog operacional / OS</CardTitle><p className="mt-1 text-sm text-muted-foreground">Críticos aparecem primeiro. Trabalhe placa por placa.</p></div>
                  <div className="flex flex-1 flex-wrap justify-end gap-2">
                    <div className="relative min-w-52 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, SN, PON ou OS" className="pl-9" /></div>
                    <Select value={city} onValueChange={(value) => setCity(value as typeof city)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as cidades</SelectItem>{SIGNAL_CITIES.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
                    <Select value={board} onValueChange={setBoard}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas placas</SelectItem>{availableBoards.map((value) => <SelectItem key={value} value={value}>Placa {value}</SelectItem>)}</SelectContent></Select>
                    <Select value={baseState} onValueChange={(value) => setBaseState(value as typeof baseState)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="atuais">Ruins agora</SelectItem><SelectItem value="normalizados">Normalizados</SelectItem><SelectItem value="todos">Backlog histórico</SelectItem></SelectContent></Select>
                    <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos status</SelectItem><SelectItem value="aberto">Backlog</SelectItem><SelectItem value="em_andamento">Em OS</SelectItem><SelectItem value="encerrado">Encerrados</SelectItem></SelectContent></Select>
                    <Select value={issue} onValueChange={(value) => setIssue(value as typeof issue)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos critérios</SelectItem><SelectItem value="desequilibrio">Diferença &gt;3 dB</SelectItem><SelectItem value="sinal_ruim">1490 ≤ -25</SelectItem><SelectItem value="ambos">Ambos</SelectItem></SelectContent></Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "aberto", label: "Backlog", count: segmentCounts.aberto },
                    { value: "em_andamento", label: "OS em andamento", count: segmentCounts.em_andamento },
                    { value: "encerrado", label: "Encerradas", count: segmentCounts.encerrado },
                    { value: "todos", label: "Todos", count: segmentCounts.aberto + segmentCounts.em_andamento + segmentCounts.encerrado },
                  ] as const).map((segment) => (
                    <Button key={segment.value} size="sm" variant={status === segment.value ? "default" : "outline"} onClick={() => setStatus(segment.value)}>
                      {segment.label} · {segment.count.toLocaleString("pt-BR")}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Cliente / SN</TableHead><TableHead>Rede</TableHead><TableHead>Sinais</TableHead><TableHead>Triagem</TableHead><TableHead>OS / técnico</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {paged.length ? paged.map((item) => {
                        const infra = causeNeedsInfra(item.cause);
                        return <TableRow key={item.id} className={item.status === "encerrado" ? "bg-emerald-50 hover:bg-emerald-100/70" : infra ? "bg-orange-50 hover:bg-orange-100/70" : undefined}>
                          <TableCell className="min-w-60"><p className="font-medium">{item.customer_name}</p><p className="text-xs text-muted-foreground">SN {item.sn} · {item.city}</p>{!item.present_in_latest_import && <Badge variant="outline" className="mt-1 text-emerald-700">Normalizado na última coleta</Badge>}</TableCell>
                          <TableCell className="min-w-44"><p>{item.olt || "—"}</p><p className="text-xs text-muted-foreground">Placa {item.board || "—"} · PON {item.port || "—"}</p></TableCell>
                          <TableCell className="min-w-36 font-mono text-xs"><p>1310: {item.signal_1310.toFixed(2)}</p><p>1490: {item.signal_1490.toFixed(2)}</p><p className="font-semibold">Δ {item.difference_db.toFixed(2)} dB</p></TableCell>
                          <TableCell><Badge variant={item.severity === "critico" ? "destructive" : "secondary"}>{item.severity === "critico" ? "P1 · Crítico" : "P2 · Alto"}</Badge><p className="mt-1 text-xs text-muted-foreground">{issueLabel(item.issue_kind)}</p></TableCell>
                          <TableCell><p className="text-sm">{item.hubsoft_os ? `OS ${item.hubsoft_os}` : "Sem OS"}</p><p className="text-xs text-muted-foreground">{item.assigned_technician_name || "Técnico não definido"}</p></TableCell>
                          <TableCell><Badge className={infra ? "bg-orange-100 text-orange-800 hover:bg-orange-100" : STATUS_COLORS[item.status]}>{infra ? "P0 · Infra/rede" : STATUS_LABELS[item.status]}</Badge>{item.cause && <p className="mt-1 text-xs text-muted-foreground">{causeLabel(item.cause)}</p>}</TableCell>
                          <TableCell className="text-right"><Button size="sm" onClick={() => openCase(item)}>{item.status === "aberto" ? "Abrir OS" : "Atualizar OS"}</Button></TableCell>
                        </TableRow>;
                      }) : <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">Nenhum cliente corresponde aos filtros.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">{filtered.length.toLocaleString("pt-BR")} registros · página {page} de {pageCount}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Button><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Próxima <ChevronRight className="h-4 w-4" /></Button></div></div>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing?.status === "aberto" ? "Abrir OS preventiva" : "Controle da OS preventiva"}</DialogTitle><DialogDescription>{editing?.customer_name} · {editing ? issueLabel(editing.issue_kind) : ""}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2"><Label>Status</Label>{editing?.status === "aberto" ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">OS será aberta como <strong>Em andamento</strong>.</p> : <Select value={draftStatus} onValueChange={(value) => setDraftStatus(value as SignalStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="em_andamento">Manter em andamento</SelectItem><SelectItem value="encerrado">Encerrar OS</SelectItem></SelectContent></Select>}</div>
            <div className="space-y-2"><Label>Nº OS Hubsoft {editing?.status !== "aberto" && draftStatus === "encerrado" ? "*" : "(opcional na abertura)"}</Label><Input value={draftOs} onChange={(event) => setDraftOs(event.target.value)} placeholder="Ex.: 123456" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Técnico responsável — controle interno</Label><Select value={draftTechnicianId || "sem_tecnico"} onValueChange={(value) => setDraftTechnicianId(value === "sem_tecnico" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem_tecnico">Ainda não definido</SelectItem>{(techniciansQuery.data ?? []).map((tech) => <SelectItem key={tech.id} value={tech.id}>{tech.full_name}{tech.city ? ` · ${tech.city}` : ""}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Não envia tarefa ao técnico. A OS continua sendo aberta e tratada no Hubsoft; aqui é seu controle gerencial.</p></div>
            <div className="space-y-2 sm:col-span-2"><Label>Causa identificada {draftStatus === "encerrado" && "*"}</Label><Select value={draftCause || "nao_informada"} onValueChange={(value) => setDraftCause(value === "nao_informada" ? "" : value as SignalCause)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao_informada">Ainda não identificada</SelectItem>{SIGNAL_CAUSES.map((cause) => <SelectItem key={cause.value} value={cause.value}>{cause.infra ? "🟠 " : ""}{cause.label}</SelectItem>)}</SelectContent></Select>{causeNeedsInfra(draftCause || null) && <div className="rounded-md border border-orange-300 bg-orange-50 p-2 text-sm text-orange-900"><Network className="mr-1 inline h-4 w-4" /> Caso destacado em laranja para investigação/infraestrutura.</div>}</div>
            <div className="space-y-2"><Label>Sinal final 1310 (opcional)</Label><Input value={draftFinal1310} onChange={(event) => setDraftFinal1310(event.target.value)} placeholder="-21.50" /></div>
            <div className="space-y-2"><Label>Sinal final 1490 (opcional)</Label><Input value={draftFinal1490} onChange={(event) => setDraftFinal1490(event.target.value)} placeholder="-22.10" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Observação / solução aplicada</Label><Textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} rows={4} placeholder="Ex.: acoplador substituído; 1490 -21 dBm; conexão normalizada." /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button disabled={!editing || updateMutation.isPending || (editing?.status !== "aberto" && draftStatus === "encerrado" && (!draftCause || !draftOs.trim()))} onClick={() => { if (!editing) return; const technician = (techniciansQuery.data ?? []).find((item) => item.id === draftTechnicianId); const nextStatus: SignalStatus = editing.status === "aberto" ? "em_andamento" : draftStatus; updateMutation.mutate({ id: editing.id, status: nextStatus, cause: draftCause || null, notes: draftNotes, hubsoftOs: draftOs.trim() || null, assignedTechnicianId: draftTechnicianId || null, assignedTechnicianName: technician?.full_name ?? null, finalSignal1310: toOptionalNumber(draftFinal1310), finalSignal1490: toOptionalNumber(draftFinal1490) }); }}>{updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing?.status === "aberto" ? "Salvar abertura da OS" : "Salvar controle"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const OS_CARD_TONES = {
  amber: "border-amber-300 bg-amber-100/80 hover:bg-amber-100",
  blue: "border-sky-300 bg-sky-100/80 hover:bg-sky-100",
  emerald: "border-emerald-300 bg-emerald-100/80 hover:bg-emerald-100",
} as const;

function OsStickyCard({
  item,
  tone,
  onClick,
}: {
  item: SignalCase;
  tone: keyof typeof OS_CARD_TONES;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${OS_CARD_TONES[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.customer_name}</p>
        {item.severity === "critico" && <Badge variant="destructive" className="shrink-0 text-[10px]">P1</Badge>}
      </div>
      <p className="mt-1 text-[11px] text-slate-600">
        {item.city} · placa {item.board || "—"} · PON {item.port || "—"}
      </p>
      <p className="mt-1 font-mono text-[11px] text-slate-700">
        1310 {item.signal_1310.toFixed(1)} · 1490 {item.signal_1490.toFixed(1)} · Δ {item.difference_db.toFixed(1)}
      </p>
      <p className="mt-2 text-[11px] font-medium text-slate-700">
        {item.hubsoft_os ? `OS ${item.hubsoft_os}` : "Sem nº de OS"}
        {item.assigned_technician_name ? ` · ${item.assigned_technician_name}` : ""}
      </p>
      {item.status === "encerrado" && item.cause && (
        <p className="mt-1 text-[11px] text-emerald-800">{causeLabel(item.cause)}</p>
      )}
      {item.status === "em_andamento" && !item.present_in_latest_import && (
        <p className="mt-1 text-[11px] text-emerald-800">Normalizado na última coleta</p>
      )}
    </button>
  );
}

function HeroNumber({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs uppercase tracking-wide opacity-75">{label}</p><p className="mt-1 text-3xl font-bold">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p></div>;
}

function ImpactCell({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "danger" | "infra" }) {
  const className = tone === "danger" ? "text-rose-600" : tone === "success" ? "text-emerald-600" : tone === "infra" ? "text-orange-600" : "text-foreground";
  return <div className="bg-background p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 text-3xl font-bold ${className}`}>{value.toLocaleString("pt-BR")}</p></div>;
}

function MetricCard({ label, value, icon: Icon, tone = "neutral" }: { label: string; value: string | number; icon: typeof Activity; tone?: "neutral" | "success" | "warning" | "danger" | "infra" }) {
  const tones = { neutral: "bg-slate-100 text-slate-700", success: "bg-emerald-100 text-emerald-700", warning: "bg-amber-100 text-amber-700", danger: "bg-rose-100 text-rose-700", infra: "bg-orange-100 text-orange-700" };
  return <Card><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p></div><div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div></CardContent></Card>;
}
