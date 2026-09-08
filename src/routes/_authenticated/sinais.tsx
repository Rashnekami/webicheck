import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileUp,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Wrench,
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
  causeLabel,
  importSignalAudit,
  listSignalCases,
  listSignalEvents,
  listSignalImports,
  parseSmartOltCsv,
  updateSignalCase,
  type SignalCase,
  type SignalCause,
  type SignalCsvPreview,
  type SignalStatus,
} from "@/lib/signal-audit";

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

const CHART_COLORS = [
  "#1a53ff",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#64748b",
  "#f97316",
  "#ec4899",
];

const PAGE_SIZE = 25;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function SignalAudit() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<SignalCsvPreview | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [readingFile, setReadingFile] = useState(false);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("todas");
  const [status, setStatus] = useState<"todos" | SignalStatus>("todos");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SignalCase | null>(null);
  const [draftStatus, setDraftStatus] = useState<SignalStatus>("aberto");
  const [draftCause, setDraftCause] = useState<SignalCause | "">("");
  const [draftNotes, setDraftNotes] = useState("");

  useEffect(() => {
    if (!userLoading && user && !user.isAdmin) {
      navigate({ to: "/painel", replace: true });
    }
  }, [user, userLoading, navigate]);

  const importsQuery = useQuery({
    queryKey: ["signal-imports"],
    queryFn: listSignalImports,
    enabled: !!user?.isAdmin,
  });
  const latestImport = importsQuery.data?.[0];

  const casesQuery = useQuery({
    queryKey: ["signal-cases", latestImport?.id],
    queryFn: () => listSignalCases(latestImport!.id),
    enabled: !!user?.isAdmin && !!latestImport?.id,
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
    mutationFn: () => importSignalAudit({ sourceName, preview: preview! }),
    onSuccess: async () => {
      setPreview(null);
      setSourceName("");
      await queryClient.invalidateQueries({ queryKey: ["signal-imports"] });
      toast.success("Base importada e separada por cidade.");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Não foi possível salvar a importação.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateSignalCase,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["signal-cases"] }),
        queryClient.invalidateQueries({ queryKey: ["signal-events"] }),
      ]);
      setEditing(null);
      toast.success("Caso atualizado no histórico.");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Não foi possível atualizar este caso.");
    },
  });

  const cases = useMemo(() => casesQuery.data ?? [], [casesQuery.data]);
  const cities = useMemo(
    () =>
      Array.from(new Set(cases.map((item) => item.city))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [cases],
  );

  const totals = useMemo(() => {
    const open = cases.filter((item) => item.status === "aberto").length;
    const active = cases.filter((item) => item.status === "em_andamento").length;
    const closed = cases.filter((item) => item.status === "encerrado").length;
    return {
      total: cases.length,
      open,
      active,
      closed,
      progress: cases.length ? Math.round((closed / cases.length) * 1000) / 10 : 0,
    };
  }, [cases]);

  const cityStats = useMemo(
    () =>
      cities.map((name) => {
        const items = cases.filter((item) => item.city === name);
        const closed = items.filter((item) => item.status === "encerrado").length;
        return {
          city: name,
          total: items.length,
          closed,
          progress: items.length ? Math.round((closed / items.length) * 1000) / 10 : 0,
        };
      }),
    [cases, cities],
  );

  const causes = useMemo(() => {
    const counts = new Map<string, number>();
    cases
      .filter((item) => item.status === "encerrado" && item.cause)
      .forEach((item) =>
        counts.set(causeLabel(item.cause), (counts.get(causeLabel(item.cause)) ?? 0) + 1),
      );
    return Array.from(counts, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value,
    );
  }, [cases]);

  const daily = useMemo(() => {
    const days: Array<{ key: string; label: string; base: number; closed: number }> = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
        base: 0,
        closed: 0,
      });
    }
    const byKey = new Map(days.map((day) => [day.key, day]));
    const latestBaseByDate = new Set<string>();
    (importsQuery.data ?? []).forEach((item) => {
      const key = item.created_at.slice(0, 10);
      const day = byKey.get(key);
      if (day && !latestBaseByDate.has(key)) {
        day.base = item.flagged_row_count;
        latestBaseByDate.add(key);
      }
    });
    (eventsQuery.data ?? [])
      .filter((event) => event.status === "encerrado")
      .forEach((event) => {
        const day = byKey.get(event.created_at.slice(0, 10));
        if (day) day.closed += 1;
      });
    return days;
  }, [eventsQuery.data, importsQuery.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return cases.filter((item) => {
      if (city !== "todas" && item.city !== city) return false;
      if (status !== "todos" && item.status !== status) return false;
      if (!needle) return true;
      return [item.customer_name, item.sn, item.olt, item.zone, item.odb]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [cases, city, search, status]);

  useEffect(() => setPage(1), [city, search, status, latestImport?.id]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setReadingFile(true);
    try {
      const parsed = parseSmartOltCsv(await file.text());
      setPreview(parsed);
      setSourceName(file.name);
      toast.success(
        `${parsed.rows.length.toLocaleString("pt-BR")} casos acima de 3 dB encontrados.`,
      );
    } catch (error) {
      setPreview(null);
      setSourceName("");
      toast.error(error instanceof Error ? error.message : "CSV inválido.");
    } finally {
      setReadingFile(false);
    }
  }

  function openCase(item: SignalCase) {
    setEditing(item);
    setDraftStatus(item.status);
    setDraftCause(item.cause ?? "");
    setDraftNotes(item.notes ?? "");
  }

  if (userLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <CheckTecnicoMark size={64} className="animate-pulse" />
      </div>
    );
  }
  if (!user.isAdmin) return null;

  const loadingData = importsQuery.isLoading || (!!latestImport && casesQuery.isLoading);
  const dataError = importsQuery.error || casesQuery.error;

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
                CheckTecnico · uso pessoal
              </p>
              <h1 className="text-lg font-semibold">Auditoria de sinais</h1>
            </div>
          </div>
          <Badge className="bg-white/20 text-white hover:bg-white/20">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Privado
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Base atual" value={totals.total} icon={Activity} />
          <MetricCard label="Abertos" value={totals.open} icon={CircleDot} tone="warning" />
          <MetricCard label="Em andamento" value={totals.active} icon={Wrench} tone="primary" />
          <MetricCard label="Encerrados" value={totals.closed} icon={CheckCircle2} tone="success" />
          <MetricCard
            label="Progresso"
            value={`${totals.progress.toLocaleString("pt-BR")}%`}
            icon={BarChart3}
            tone="success"
          />
        </section>

        <Card className="overflow-hidden border-primary/20">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="font-semibold text-foreground">Importar relatório SmartOLT</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Considera apenas ONUs com diferença absoluta maior que 3 dB entre Signal 1310 e
                Signal 1490. Uma nova importação atualiza as leituras sem apagar o andamento já
                registrado.
              </p>
              {latestImport && !preview && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Última base: {latestImport.source_name} · {formatDate(latestImport.created_at)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor="signal-csv"
                className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
              >
                {readingFile ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="mr-2 h-4 w-4" />
                )}
                Selecionar CSV
              </Label>
              <Input
                id="signal-csv"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              {preview && (
                <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Importar {preview.rows.length.toLocaleString("pt-BR")} casos
                </Button>
              )}
            </div>
          </CardContent>
          {preview && (
            <div className="border-t bg-muted/35 px-5 py-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span>
                  <strong>{preview.sourceRows.toLocaleString("pt-BR")}</strong> linhas no arquivo
                </span>
                <span>
                  <strong>{preview.validRows.toLocaleString("pt-BR")}</strong> ONUs com leitura
                  válida
                </span>
                {Object.entries(preview.cityCounts).map(([name, total]) => (
                  <span key={name}>
                    <strong>{total.toLocaleString("pt-BR")}</strong> em {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        {loadingData ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando auditoria...
            </CardContent>
          </Card>
        ) : dataError ? (
          <Card className="border-destructive/30">
            <CardContent className="py-10 text-center">
              <p className="font-medium text-destructive">
                A área de sinais ainda não está disponível.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A atualização do banco precisa ser publicada antes do primeiro uso.
              </p>
            </CardContent>
          </Card>
        ) : !latestImport ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileUp className="mx-auto h-9 w-9 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">Importe a primeira base</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Os casos serão separados por cidade automaticamente.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Progresso por cidade</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cityStats.map((item) => (
                  <Card key={item.city}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.city}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.closed} de {item.total} encerrados
                          </p>
                        </div>
                        <strong className="text-xl text-primary">
                          {item.progress.toLocaleString("pt-BR")}%
                        </strong>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evolução diária — últimos 14 dias</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ left: -20, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Bar
                        dataKey="base"
                        name="Base importada"
                        fill="#93c5fd"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="closed"
                        name="Encerrados no dia"
                        fill="#22c55e"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">O que mais degradou o sinal</CardTitle>
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
                            <Cell
                              key={item.name}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                      As causas aparecerão aqui conforme os casos forem encerrados.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Clientes para tratar</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {filtered.length.toLocaleString("pt-BR")} registros encontrados
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap justify-end gap-2">
                    <div className="relative min-w-56 flex-1 sm:max-w-xs">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cliente, SN, OLT ou splitter"
                        className="pl-9"
                      />
                    </div>
                    <Select value={city} onValueChange={setCity}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as cidades</SelectItem>
                        {cities.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={status}
                      onValueChange={(value) => setStatus(value as "todos" | SignalStatus)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os status</SelectItem>
                        <SelectItem value="aberto">Abertos</SelectItem>
                        <SelectItem value="em_andamento">Em andamento</SelectItem>
                        <SelectItem value="encerrado">Encerrados</SelectItem>
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
                        <TableHead className="text-right">1310</TableHead>
                        <TableHead className="text-right">1490</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.length ? (
                        paged.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="min-w-64">
                              <p className="font-medium">{item.customer_name}</p>
                              <p className="text-xs text-muted-foreground">
                                SN {item.sn} · {item.onu_type || "ONT não informada"}
                              </p>
                            </TableCell>
                            <TableCell>{item.city}</TableCell>
                            <TableCell className="min-w-48">
                              <p className="text-sm">{item.olt || "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                Placa {item.board || "—"} · PON {item.port || "—"} · ONU{" "}
                                {item.allocated_onu || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.signal_1310.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {item.signal_1490.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="destructive">
                                {item.difference_db.toFixed(2)} dB
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_COLORS[item.status]}>
                                {STATUS_LABELS[item.status]}
                              </Badge>
                              {item.cause && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {causeLabel(item.cause)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openCase(item)}>
                                Registrar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
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
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Página {page} de {pageCount}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((value) => value - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pageCount}
                      onClick={() => setPage((value) => value + 1)}
                    >
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar tratamento</DialogTitle>
            <DialogDescription>
              {editing?.customer_name} · diferença de {editing?.difference_db.toFixed(2)} dB
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={draftStatus}
                onValueChange={(value) => setDraftStatus(value as SignalStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Causa identificada {draftStatus === "encerrado" && "*"}</Label>
              <Select
                value={draftCause || "nao_informada"}
                onValueChange={(value) =>
                  setDraftCause(value === "nao_informada" ? "" : (value as SignalCause))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_informada">Ainda não identificada</SelectItem>
                  {SIGNAL_CAUSES.map((cause) => (
                    <SelectItem key={cause.value} value={cause.value}>
                      {cause.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signal-notes">Observação / solução aplicada</Label>
              <Textarea
                id="signal-notes"
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                placeholder="Ex.: conector substituído e sinal normalizado"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !editing || updateMutation.isPending || (draftStatus === "encerrado" && !draftCause)
              }
              onClick={() =>
                editing &&
                updateMutation.mutate({
                  id: editing.id,
                  status: draftStatus,
                  cause: draftCause || null,
                  notes: draftNotes,
                })
              }
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
              registro
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
  tone?: "neutral" | "primary" | "success" | "warning";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    primary: "bg-blue-100 text-blue-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
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
