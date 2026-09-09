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
  Network,
  Search,
  ShieldCheck,
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
  issueLabel,
  listSignalCases,
  listSignalEvents,
  listSignalImports,
  mergeSignalPreviews,
  parseSmartOltCsv,
  updateSignalCase,
  type SignalCase,
  type SignalCause,
  type SignalCity,
  type SignalCsvPreview,
  type SignalIssueKind,
  type SignalStatus,
} from "@/lib/signal-audit";
import {
  listSignalAiAnalyses,
  listSignalTechnicians,
  runSignalAiAnalysis,
} from "@/lib/signal-audit.functions";

export const Route = createFileRoute("/_authenticated/sinais")({
  head: () => ({
    meta: [{ title: "Auditoria de sinais — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: SignalAudit,
});

const STATUS_LABELS: Record<SignalStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  encerrado: "Encerrado",
};
const STATUS_COLORS: Record<SignalStatus, string> = {
  aberto: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  em_andamento: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  encerrado: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
};
const CHART_COLORS = ["#1a53ff", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"];
const PAGE_SIZE = 25;

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

function SignalAudit() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [importCity, setImportCity] = useState<SignalCity>("Telêmaco Borba");
  const [preview, setPreview] = useState<SignalCsvPreview | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [readingFile, setReadingFile] = useState(false);

  const [search, setSearch] = useState("");
  const [city, setCity] = useState<"todas" | SignalCity>("todas");
  const [status, setStatus] = useState<"todos" | SignalStatus>("todos");
  const [issue, setIssue] = useState<"todos" | SignalIssueKind>("todos");
  const [baseState, setBaseState] = useState<"atuais" | "normalizados" | "todos">("atuais");
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
      ]);
      toast.success(`Lote de ${importCity} importado com sucesso.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao importar."),
  });

  const updateMutation = useMutation({
    mutationFn: updateSignalCase,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["signal-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["signal-events"] }),
      ]);
      setEditing(null);
      toast.success("Controle da OS atualizado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao atualizar."),
  });

  const aiMutation = useMutation({
    mutationFn: () => runSignalAiAnalysis({ data: { city: city === "todas" ? null : city } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["signal-ai"] });
      toast.success("Análise de causas atualizada.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Falha na análise por IA."),
  });

  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data]);
  const current = useMemo(() => cases.filter((item) => item.present_in_latest_import), [cases]);
  const totals = useMemo(
    () => ({
      current: current.length,
      critical: current.filter((item) => item.severity === "critico").length,
      imbalance: current.filter(
        (item) => item.issue_kind === "desequilibrio" || item.issue_kind === "ambos",
      ).length,
      low: current.filter(
        (item) => item.issue_kind === "sinal_ruim" || item.issue_kind === "ambos",
      ).length,
      infra: cases.filter((item) => item.status !== "encerrado" && causeNeedsInfra(item.cause)).length,
      closed: cases.filter((item) => item.status === "encerrado").length,
    }),
    [cases, current],
  );

  const cityStats = useMemo(
    () =>
      SIGNAL_CITIES.map((name) => {
        const items = current.filter((item) => item.city === name);
        const critical = items.filter((item) => item.severity === "critico").length;
        const active = cases.filter(
          (item) => item.city === name && item.status === "em_andamento",
        ).length;
        return { city: name, total: items.length, critical, active };
      }),
    [cases, current],
  );

  const causes = useMemo(() => {
    const counts = new Map<string, number>();
    cases
      .filter((item) => item.status === "encerrado" && item.cause)
      .forEach((item) => {
        const name = causeLabel(item.cause);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
    return Array.from(counts, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value,
    );
  }, [cases]);

  const daily = useMemo(() => {
    const days: Array<{ key: string; label: string; imported: number; closed: number }> = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(
          date,
        ),
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

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return cases.filter((item) => {
      if (city !== "todas" && item.city !== city) return false;
      if (status !== "todos" && item.status !== status) return false;
      if (issue !== "todos" && item.issue_kind !== issue) return false;
      if (baseState === "atuais" && !item.present_in_latest_import) return false;
      if (baseState === "normalizados" && item.present_in_latest_import) return false;
      if (!needle) return true;
      return [
        item.customer_name,
        item.sn,
        item.olt,
        item.board,
        item.port,
        item.zone,
        item.odb,
        item.hubsoft_os,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [cases, city, status, issue, baseState, search]);

  useEffect(() => setPage(1), [city, status, issue, baseState, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setReadingFile(true);
    try {
      const selected = Array.from(files);
      const previews = await Promise.all(
        selected.map(async (file) =>
          parseSmartOltCsv(await file.text(), { city: importCity, sourceFile: file.name }),
        ),
      );
      const merged = mergeSignalPreviews(previews, importCity);
      setPreview(merged);
      setSourceName(`${importCity} · ${selected.length} placa${selected.length === 1 ? "" : "s"}`);
      toast.success(
        `${merged.rows.length.toLocaleString("pt-BR")} casos encontrados em ${selected.length} arquivo(s).`,
      );
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

  if (userLoading || !user)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CheckTecnicoMark size={64} className="animate-pulse" />
      </div>
    );
  if (!user.isAdmin) return null;

  const dataError = importsQuery.error || casesQuery.error;
  const latestAi = aiQuery.data?.[0];

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/painel"
              className="rounded-full bg-white/15 p-2 hover:bg-white/25"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <CheckTecnicoMark size={40} />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">
                CheckTecnico · gestão preventiva
              </p>
              <h1 className="text-lg font-semibold">Painel de sinais</h1>
            </div>
          </div>
          <Badge className="bg-white/20 text-white hover:bg-white/20">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Privado
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Na base atual" value={totals.current} icon={Activity} />
          <MetricCard label="Críticos" value={totals.critical} icon={AlertTriangle} tone="danger" />
          <MetricCard label="Diferença >3 dB" value={totals.imbalance} icon={BarChart3} tone="warning" />
          <MetricCard label="Sinal ≤ -25" value={totals.low} icon={CircleDot} tone="warning" />
          <MetricCard label="Infra pendente" value={totals.infra} icon={Network} tone="infra" />
          <MetricCard label="Encerrados" value={totals.closed} icon={CheckCircle2} tone="success" />
        </section>

        <Card className="border-primary/20">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="font-semibold">Importar placas do SmartOLT</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha a cidade e selecione um ou vários CSVs de placas no mesmo lote. Entram
                clientes com diferença &gt; 3 dB ou qualquer leitura ≤ -25 dBm.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={importCity}
                onValueChange={(value) => {
                  setImportCity(value as SignalCity);
                  setPreview(null);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNAL_CITIES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label
                htmlFor="signal-csv"
                className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
              >
                {readingFile ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-2 h-4 w-4" />
                )}
                Selecionar CSVs/placas
              </Label>
              <Input
                id="signal-csv"
                type="file"
                multiple
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => void handleFiles(event.target.files)}
              />
              {preview && (
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Importar {preview.rows.length.toLocaleString("pt-BR")} casos
                </Button>
              )}
            </div>
            {preview && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <strong>{preview.sourceFiles.length}</strong> arquivo(s) ·{" "}
                <strong>{preview.sourceRows.toLocaleString("pt-BR")}</strong> linhas ·{" "}
                <strong>{preview.validRows.toLocaleString("pt-BR")}</strong> leituras válidas ·{" "}
                <strong>{preview.rows.length.toLocaleString("pt-BR")}</strong> casos para tratar
              </div>
            )}
          </CardContent>
        </Card>

        {dataError ? (
          <Card className="border-destructive/30">
            <CardContent className="py-10 text-center">
              <p className="font-medium text-destructive">
                O banco do Painel de Sinais ainda não foi ativado.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A migration está preparada no Preview e precisa de autorização antes de ser aplicada
                ao backend compartilhado.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              {cityStats.map((item) => (
                <Card key={item.city}>
                  <CardContent className="p-5">
                    <p className="font-semibold">{item.city}</p>
                    <p className="mt-2 text-2xl font-bold">{item.total}</p>
                    <div className="mt-2 flex gap-3 text-sm text-muted-foreground">
                      <span>{item.critical} críticos</span>
                      <span>{item.active} em OS</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evolução — últimos 14 dias</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="imported" name="Casos importados" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="closed" name="Encerrados" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Causas confirmadas</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {causes.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={causes}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {causes.map((item, index) => (
                            <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                      As causas aparecerão conforme as OS forem encerradas.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card className="border-violet-200">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-5 w-5 text-violet-600" /> Análise de causas por IA
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Usa causas confirmadas e concentrações por OLT/placa/PON. Não inventa causa de
                    cliente sem atendimento.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => aiMutation.mutate()}
                  disabled={aiMutation.isPending}
                >
                  {aiMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Analisar {city === "todas" ? "todas" : city}
                </Button>
              </CardHeader>
              <CardContent>
                {latestAi ? (
                  <div className="space-y-3 text-sm">
                    <p>{latestAi.resumo}</p>
                    {latestAi.principais_motivos.length > 0 && (
                      <div>
                        <strong>Principais motivos:</strong>
                        <ul className="mt-1 list-disc pl-5">
                          {latestAi.principais_motivos.slice(0, 5).map((item) => (
                            <li key={item.causa}>
                              {item.causa}: {item.quantidade} ({item.percentual.toLocaleString("pt-BR")}% ) — {item.leitura}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {latestAi.infraestrutura_prioritaria.length > 0 && (
                      <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-orange-900">
                        <strong>Infraestrutura prioritária</strong>
                        <ul className="mt-1 list-disc pl-5">
                          {latestAi.infraestrutura_prioritaria.slice(0, 5).map((item, index) => (
                            <li key={`${item.cidade}-${index}`}>
                              {item.cidade} · {item.olt || "OLT não informada"} · placa {item.placa || "—"} · PON {item.pon || "—"}: {item.casos} caso(s) — {item.motivo}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(latestAi.created_at)} · {latestAi.model}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A análise ficará mais útil conforme você encerrar OS e marcar as causas reais.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Clientes / controles de OS</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {filtered.length.toLocaleString("pt-BR")} registros
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap justify-end gap-2">
                    <div className="relative min-w-52 flex-1 sm:max-w-xs">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cliente, SN, OLT, placa, PON ou OS"
                        className="pl-9"
                      />
                    </div>
                    <Select value={city} onValueChange={(value) => setCity(value as typeof city)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as cidades</SelectItem>
                        {SIGNAL_CITIES.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={baseState} onValueChange={(value) => setBaseState(value as typeof baseState)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="atuais">Na base atual</SelectItem>
                        <SelectItem value="normalizados">Saíram da base</SelectItem>
                        <SelectItem value="todos">Histórico todo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos status</SelectItem>
                        <SelectItem value="aberto">Abertos</SelectItem>
                        <SelectItem value="em_andamento">Em OS</SelectItem>
                        <SelectItem value="encerrado">Encerrados</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={issue} onValueChange={(value) => setIssue(value as typeof issue)}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos critérios</SelectItem>
                        <SelectItem value="desequilibrio">Diferença &gt;3 dB</SelectItem>
                        <SelectItem value="sinal_ruim">Sinal ≤ -25</SelectItem>
                        <SelectItem value="ambos">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente / SN</TableHead>
                        <TableHead>Cidade</TableHead>
                        <TableHead>Rede</TableHead>
                        <TableHead>Sinais</TableHead>
                        <TableHead>Critério</TableHead>
                        <TableHead>OS / técnico</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.length ? (
                        paged.map((item) => {
                          const infra = causeNeedsInfra(item.cause);
                          return (
                            <TableRow
                              key={item.id}
                              className={infra ? "bg-orange-50 hover:bg-orange-100/70" : undefined}
                            >
                              <TableCell className="min-w-60">
                                <p className="font-medium">{item.customer_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  SN {item.sn} · {item.onu_type || "ONT não informada"}
                                </p>
                                {!item.present_in_latest_import && (
                                  <Badge variant="outline" className="mt-1 text-emerald-700">
                                    Saiu da última base
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>{item.city}</TableCell>
                              <TableCell className="min-w-44">
                                <p>{item.olt || "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  Placa {item.board || "—"} · PON {item.port || "—"}
                                </p>
                              </TableCell>
                              <TableCell className="min-w-36 font-mono text-xs">
                                <p>1310: {item.signal_1310.toFixed(2)}</p>
                                <p>1490: {item.signal_1490.toFixed(2)}</p>
                                <p className="font-semibold">Δ {item.difference_db.toFixed(2)} dB</p>
                              </TableCell>
                              <TableCell>
                                <Badge variant={item.severity === "critico" ? "destructive" : "secondary"}>
                                  {item.severity === "critico" ? "Crítico" : "Alto"}
                                </Badge>
                                <p className="mt-1 text-xs text-muted-foreground">{issueLabel(item.issue_kind)}</p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm">{item.hubsoft_os ? `OS ${item.hubsoft_os}` : "Sem OS"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.assigned_technician_name || "Técnico não definido"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Badge className={infra ? "bg-orange-100 text-orange-800 hover:bg-orange-100" : STATUS_COLORS[item.status]}>
                                  {infra ? "Infra / rede" : STATUS_LABELS[item.status]}
                                </Badge>
                                {item.cause && <p className="mt-1 text-xs text-muted-foreground">{causeLabel(item.cause)}</p>}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="outline" size="sm" onClick={() => openCase(item)}>
                                  {item.status === "aberto" ? "Abrir OS" : "Atualizar"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                            Nenhum cliente corresponde aos filtros.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Página {page} de {pageCount}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>
                      Próxima <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Controle da OS preventiva</DialogTitle>
            <DialogDescription>
              {editing?.customer_name} · {editing ? issueLabel(editing.issue_kind) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={draftStatus} onValueChange={(value) => setDraftStatus(value as SignalStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_andamento">OS aberta / em andamento</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nº OS Hubsoft</Label>
              <Input value={draftOs} onChange={(event) => setDraftOs(event.target.value)} placeholder="Ex.: 123456" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Técnico responsável (controle interno)</Label>
              <Select
                value={draftTechnicianId || "sem_tecnico"}
                onValueChange={(value) => setDraftTechnicianId(value === "sem_tecnico" ? "" : value)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_tecnico">Ainda não definido</SelectItem>
                  {(techniciansQuery.data ?? []).map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.full_name}{tech.city ? ` · ${tech.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Isto não envia tarefa ao técnico; serve apenas para seu acompanhamento.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Causa identificada {draftStatus === "encerrado" && "*"}</Label>
              <Select
                value={draftCause || "nao_informada"}
                onValueChange={(value) => setDraftCause(value === "nao_informada" ? "" : (value as SignalCause))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_informada">Ainda não identificada</SelectItem>
                  {SIGNAL_CAUSES.map((cause) => (
                    <SelectItem key={cause.value} value={cause.value}>
                      {cause.infra ? "🟠 " : ""}{cause.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {causeNeedsInfra(draftCause || null) && (
                <div className="rounded-md border border-orange-300 bg-orange-50 p-2 text-sm text-orange-900">
                  <Network className="mr-1 inline h-4 w-4" /> Este caso ficará destacado em laranja para abertura/controle de infraestrutura.
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Sinal final 1310 (opcional)</Label>
              <Input value={draftFinal1310} onChange={(event) => setDraftFinal1310(event.target.value)} placeholder="-21.50" />
            </div>
            <div className="space-y-2">
              <Label>Sinal final 1490 (opcional)</Label>
              <Input value={draftFinal1490} onChange={(event) => setDraftFinal1490(event.target.value)} placeholder="-22.10" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Observação / solução aplicada</Label>
              <Textarea
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                rows={4}
                placeholder="Ex.: acoplador substituído; sinal -21 dBm; conexão normalizada."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              disabled={!editing || updateMutation.isPending || (draftStatus === "encerrado" && !draftCause)}
              onClick={() => {
                if (!editing) return;
                const technician = (techniciansQuery.data ?? []).find((item) => item.id === draftTechnicianId);
                updateMutation.mutate({
                  id: editing.id,
                  status: draftStatus,
                  cause: draftCause || null,
                  notes: draftNotes,
                  hubsoftOs: draftOs || null,
                  assignedTechnicianId: draftTechnicianId || null,
                  assignedTechnicianName: technician?.full_name ?? null,
                  finalSignal1310: toOptionalNumber(draftFinal1310),
                  finalSignal1490: toOptionalNumber(draftFinal1490),
                });
              }}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar controle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  tone?: "neutral" | "success" | "warning" | "danger" | "infra";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    infra: "bg-orange-100 text-orange-700",
  };
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">
            {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
          </p>
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
