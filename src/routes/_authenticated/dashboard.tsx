import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  BarChart3,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  ClipboardCheck,
  Wrench,
  Wifi,
  MapPin,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
  ComposedChart,
  Area,
  Line,
  LabelList,
} from "recharts";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listChecklists } from "@/lib/checklists";
import {
  aggregate,
  applyFilters,
  computePeriod,
  formatMonthBR,
  toCanon,
  type DashboardFilters,
  type PeriodPreset,
} from "@/lib/dashboard-analytics";
import { generatePresentationZip, presentationZipFilename } from "@/services/presentation-export";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: Dashboard,
});

const COLORS = [
  "#168cff",
  "#19d8ff",
  "#35d878",
  "#ffb020",
  "#ff5268",
  "#8b7cff",
  "#17c8b5",
  "#f4d44d",
];

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(3, 16, 39, .97)",
  border: "1px solid rgba(43, 139, 255, .38)",
  borderRadius: 14,
  color: "#f8fafc",
  boxShadow: "0 18px 48px rgba(0, 0, 0, .42)",
};

function Dashboard() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!userLoading && user && !user.isAdmin) {
      navigate({ to: "/painel", replace: true });
    }
  }, [user, userLoading, navigate]);

  const [preset, setPreset] = useState<PeriodPreset>("mes_atual");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [cidade, setCidade] = useState<string>("todas");
  const [tecnicoId, setTecnicoId] = useState<string>("todos");
  const [tipo, setTipo] = useState<"todos" | "validacao_ont" | "instalacao">("todos");
  const [analista, setAnalista] = useState<string>("todos");
  const [status, setStatus] = useState<"todos" | "com_troca" | "sem_troca" | "nao_informado">(
    "todos",
  );
  const [exporting, setExporting] = useState(false);

  const query = useQuery({
    queryKey: ["dashboard-checklists"],
    queryFn: () => listChecklists({ scope: "all", userId: user!.id }),
    enabled: !!user?.isAdmin,
  });

  const profilesQuery = useQuery({
    queryKey: ["dashboard-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.isAdmin,
  });

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((p) =>
      m.set(p.id, p.full_name || p.email || p.id.slice(0, 8)),
    );
    return m;
  }, [profilesQuery.data]);

  // Canonicaliza uma única vez todos os registros finalizados.
  // Deduplica por case: cada atendimento conta apenas 1 vez (revisão atual).
  //
  // Este dashboard modela só validacao_ont/instalacao (sintomas, troca de
  // ONT, autorização de NOC) — remapeamento_cto/rompimento/readequacao/
  // melhoria_sinal têm formato de dados totalmente diferente (portas,
  // splitter, rota, OTDR) e já têm indicadores próprios em /remapeamentos
  // e /intervencoes. normalizeChecklistType() só distingue "instalacao" de
  // "resto", então sem este filtro TODO checklist de rede entrava aqui
  // classificado como "Validação de ONT" — sintomas sempre vazios e troca
  // sempre "não informada", inflando artificialmente o aviso de dados
  // faltando com atendimentos que não são de ONT.
  const canonAll = useMemo(() => {
    return (query.data ?? [])
      .filter((c) => c.status === "finalizado")
      .filter((c) => c.is_current !== false)
      .filter((c) => c.tipo === "validacao_ont" || c.tipo === "instalacao")
      .map((c) => toCanon(c, nomePorId));
  }, [query.data, nomePorId]);

  const period = useMemo(
    () =>
      computePeriod(preset, {
        start: customStart || undefined,
        end: customEnd || undefined,
      }),
    [preset, customStart, customEnd],
  );

  const filters: DashboardFilters = useMemo(
    () => ({
      startISO: period.startISO,
      endISO: period.endISO,
      cidade: cidade !== "todas" ? cidade : undefined,
      tecnicoId: tecnicoId !== "todos" ? tecnicoId : undefined,
      tipo,
      analistaNoc: analista !== "todos" ? analista : undefined,
      status,
    }),
    [period, cidade, tecnicoId, tipo, analista, status],
  );

  const filtered = useMemo(() => applyFilters(canonAll, filters), [canonAll, filters]);
  const agg = useMemo(() => aggregate(filtered), [filtered]);

  // Série temporal (Grafana-style): sempre os últimos 12 meses, independente
  // do preset de período escolhido acima. Um gráfico de tendência que só
  // mostra o mesmo mês selecionado no filtro de período não serve pra ver
  // tendência nenhuma — os outros filtros (cidade/técnico/tipo/analista/
  // status) continuam valendo, só a janela de tempo é fixa e mais longa.
  const trendFilters: DashboardFilters = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    return { ...filters, startISO: start.toISOString(), endISO: end.toISOString() };
  }, [filters]);
  const trendAgg = useMemo(
    () => aggregate(applyFilters(canonAll, trendFilters)),
    [canonAll, trendFilters],
  );

  // Opções únicas para os selects (baseadas em TODO o dataset canonizado)
  const cidadesOpts = useMemo(
    () =>
      Array.from(new Set(canonAll.map((r) => r.cidade).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [canonAll],
  );
  const tecnicosOpts = useMemo(() => {
    const m = new Map<string, string>();
    canonAll.forEach((r) => m.set(r.tecnicoId, r.tecnicoNome));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [canonAll]);
  const analistasOpts = useMemo(
    () =>
      Array.from(new Set(canonAll.map((r) => r.analistaNocNome).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [canonAll],
  );

  if (userLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WebifibraLogo size={56} className="animate-pulse" />
      </div>
    );
  }
  if (!user.isAdmin) return null;

  function exportDetailedCsv() {
    const header = [
      "numero_publico",
      "codigo_validacao",
      "tipo",
      "finalizado_em",
      "tecnico",
      "cliente",
      "cidade",
      "os",
      "modelo_retirado",
      "serial_retirado",
      "modelo_instalado",
      "serial_instalado",
      "troca_realizada",
      "sintomas",
      "analista_noc",
      "noc_autorizada",
    ];
    const rows = (query.data ?? []).filter((c) => {
      if (c.status !== "finalizado") return false;
      if (c.is_current === false) return false;
      // Mesmo filtro de escopo do dashboard (ver canonAll) — sem isso o CSV
      // "detalhada" saía com linhas de remapeamento/intervenção nas colunas
      // de ONT, todas vazias/erradas.
      if (c.tipo !== "validacao_ont" && c.tipo !== "instalacao") return false;
      const t = c.finalizado_em ? new Date(c.finalizado_em).getTime() : 0;
      return t >= new Date(filters.startISO).getTime() && t < new Date(filters.endISO).getTime();
    });
    const lines = [header.join(";")];
    for (const c of rows) {
      const tec = nomePorId.get(c.tecnico_id) || c.tecnico_id.slice(0, 8);
      const canon = toCanon(c, nomePorId);
      lines.push(
        [
          c.numero_publico || "",
          c.codigo_validacao || "",
          c.tipo,
          c.finalizado_em || "",
          tec,
          c.cliente || "",
          c.cidade || "",
          c.os || "",
          canon.modeloOntRetirada,
          canon.serialOntRetirada,
          canon.modeloOntInstalada,
          canon.serialOntInstalada,
          canon.trocaRealizada === true
            ? "Sim"
            : canon.trocaRealizada === false
              ? "Não"
              : "Não informado",
          canon.sintomas.join(" | "),
          canon.analistaNocNome,
          canon.nocAutorizada === true ? "Sim" : canon.nocAutorizada === false ? "Não" : "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      );
    }
    downloadBlob(
      new Blob([`\ufeff${lines.join("\r\n")}\r\n`], {
        type: "text/csv;charset=utf-8",
      }),
      `webifibra-base-detalhada-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  async function exportPresentationZip() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await generatePresentationZip({
        records: filtered,
        filters,
        filterMetadata: {
          cidade: cidade !== "todas" ? cidade : undefined,
          tecnicoNome:
            tecnicoId !== "todos" ? tecnicosOpts.find(([id]) => id === tecnicoId)?.[1] : undefined,
          tipo:
            tipo === "validacao_ont"
              ? "Validação de ONT"
              : tipo === "instalacao"
                ? "Instalação"
                : undefined,
          analistaNoc: analista !== "todos" ? analista : undefined,
          status:
            status === "com_troca"
              ? "Com troca realizada"
              : status === "sem_troca"
                ? "Sem troca"
                : status === "nao_informado"
                  ? "Não informado"
                  : undefined,
        },
      });
      downloadBlob(blob, presentationZipFilename(filters));
      toast.success("Pacote para PowerPoint gerado.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o pacote de apresentação. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="webi-page min-h-screen pb-12">
      <header className="brand-gradient text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              to="/painel"
              className="rounded-full bg-white/15 p-2 hover:bg-white/25"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <WebifibraLogo size={40} className="rounded-xl" />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">Webifibra · análise</p>
              <h1 className="text-lg font-semibold">Dashboard de trocas de ONT</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/20 text-white">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={exporting}
                  className="bg-white text-primary hover:bg-white/90"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Preparando arquivos...
                    </>
                  ) : (
                    <>
                      <Download className="mr-1.5 h-4 w-4" /> Exportar
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onClick={exportDetailedCsv}>
                  <div>
                    <p className="font-medium">Base detalhada — CSV</p>
                    <p className="text-xs text-muted-foreground">
                      Registro linha a linha para auditoria
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportPresentationZip}>
                  <div>
                    <p className="font-medium">Pacote para PowerPoint — ZIP</p>
                    <p className="text-xs text-muted-foreground">
                      Um CSV por indicador, pronto para colar em gráficos
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {/* Filtros */}
        <Card className="border-blue-400/25 bg-blue-950/25">
          <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 lg:grid-cols-7">
            <div className="col-span-2 md:col-span-2 lg:col-span-2">
              <Label className="text-xs">Período</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês anterior</SelectItem>
                  <SelectItem value="ultimos_30">Últimos 30 dias</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {preset === "personalizado" && (
              <>
                <div>
                  <Label className="text-xs">De</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Cidade</Label>
              <Select value={cidade} onValueChange={setCidade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {cidadesOpts.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Técnico</Label>
              <Select value={tecnicoId} onValueChange={setTecnicoId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {tecnicosOpts.map(([id, nome]) => (
                    <SelectItem key={id} value={id}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="validacao_ont">Validação de ONT</SelectItem>
                  <SelectItem value="instalacao">Instalação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Analista NOC</Label>
              <Select value={analista} onValueChange={setAnalista}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {analistasOpts.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status da troca</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="com_troca">Com troca realizada</SelectItem>
                  <SelectItem value="sem_troca">Sem troca</SelectItem>
                  <SelectItem value="nao_informado">Não informado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {agg.totalNaoInformado > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {agg.totalNaoInformado} validaç
              {agg.totalNaoInformado === 1 ? "ão" : "ões"} sem informação de troca. Esses registros
              não são contados como trocas realizadas. Peça ao técnico responsável para preencher o
              campo “A ONT foi fisicamente substituída?” no checklist.
            </p>
          </div>
        )}

        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando dados...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={ClipboardCheck} label="Validações de ONT" value={agg.totalOnt} />
              <StatCard
                icon={Wrench}
                label="Trocas realizadas"
                value={agg.totalTrocas}
                sub={`${agg.totalSemTroca} sem troca`}
              />
              <StatCard icon={Wifi} label="Instalações" value={agg.totalInstalacoes} />
              <StatCard
                icon={MapPin}
                label="Cidades com troca"
                value={agg.cidadesComTroca.length}
              />
            </div>

            <ChartCard
              title="Evolução mensal"
              subtitle="Últimos 12 meses · independe do período selecionado acima nos filtros"
            >
              {trendAgg.evolucaoMensal.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Sem checklists finalizados nos últimos 12 meses para os filtros atuais.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendAgg.evolucaoMensal} margin={{ left: -8, right: 8 }}>
                    <defs>
                      <linearGradient id="fillValidacoes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="fillTrocas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[3]} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={COLORS[3]} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="fillInstalacoes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[2]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS[2]} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(90,145,210,.16)" strokeDasharray="4 6" vertical={false} />
                    <XAxis dataKey="monthKey" tickFormatter={formatMonthBR} fontSize={12} />
                    <YAxis
                      yAxisId="qtd"
                      allowDecimals={false}
                      fontSize={12}
                      label={{ value: "Atendimentos", angle: -90, position: "insideLeft", fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="pct"
                      orientation="right"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ stroke: "rgba(0,190,255,.55)", strokeWidth: 1, strokeDasharray: "3 3" }}
                      labelFormatter={(v) => formatMonthBR(String(v))}
                      formatter={(value: number, name: string) =>
                        name === "Taxa de autorização" ? [`${value.toFixed(0)}%`, name] : [value, name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      yAxisId="qtd"
                      type="monotone"
                      dataKey="validacoes"
                      name="Validações"
                      stroke={COLORS[0]}
                      fill="url(#fillValidacoes)"
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="qtd"
                      type="monotone"
                      dataKey="trocas"
                      name="Trocas"
                      stroke={COLORS[3]}
                      fill="url(#fillTrocas)"
                      strokeWidth={2}
                    />
                    <Area
                      yAxisId="qtd"
                      type="monotone"
                      dataKey="instalacoes"
                      name="Instalações"
                      stroke={COLORS[2]}
                      fill="url(#fillInstalacoes)"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="taxaAutorizacao"
                      name="Taxa de autorização"
                      stroke={COLORS[4]}
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Principais problemas"
                subtitle="Sintomas mais frequentes nas validações"
              >
                <RankingBarChart data={agg.sintomas} color={COLORS[0]} />
              </ChartCard>

              <ChartCard
                title="Modelos mais trocados"
                subtitle="Apenas trocas efetivamente realizadas"
              >
                <RankingBarChart data={agg.modelos} color={COLORS[1]} />
              </ChartCard>

              <ChartCard
                title="Analistas que mais liberaram trocas"
                subtitle="Autorizações positivas do NOC"
              >
                <RankingBarChart data={agg.analistas} color={COLORS[2]} />
              </ChartCard>

              <ChartCard
                title="Técnicos que mais trocaram"
                subtitle="Trocas fisicamente realizadas"
              >
                <RankingBarChart data={agg.tecnicos} color={COLORS[3]} />
              </ChartCard>

              <ChartCard title="Cidades com mais trocas" subtitle="Distribuição geográfica">
                <RankingBarChart data={agg.cidades} color={COLORS[0]} multiColor />
              </ChartCard>

              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-base">
                    <BarChart3 className="mr-2 inline h-4 w-4 text-primary" />
                    Maiores motivos por cidade
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[320px] overflow-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Cidade</th>
                        <th className="px-3 py-2 text-left font-medium">Principal problema</th>
                        <th className="px-3 py-2 text-right font-medium">Ocorrências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.motivosPorCidade.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-muted-foreground">
                            Sem dados ainda.
                          </td>
                        </tr>
                      ) : (
                        agg.motivosPorCidade.map((r) => (
                          <tr key={r.cidade} className="border-t">
                            <td className="px-3 py-2 font-medium">{r.cidade}</td>
                            <td className="px-3 py-2">{r.principal}</td>
                            <td className="px-3 py-2 text-right">{r.quantidade}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card className="overflow-hidden bg-gradient-to-br from-blue-950/75 to-slate-950/65">
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div className="webi-icon h-11 w-11 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p
            className="text-2xl font-extrabold tracking-tight text-white"
            style={{ fontVariantNumeric: "tabular-nums", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
          >
            {value}
          </p>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          {sub && <p className="mt-0.5 text-[11px] text-cyan-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="webi-chart overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <span className="webi-icon h-8 w-8 rounded-lg">
            <BarChart3 className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Ranking horizontal — o formato "top N" clássico de painel Grafana/Zabbix
// (nome legível por inteiro à esquerda, valor no fim da barra à direita).
// Substitui os antigos gráficos de barra vertical (nomes de técnico/
// analista compridos se sobrepunham nos rótulos do eixo X, um em cima do
// outro — parecia "nome errado" mas era sobreposição) e a pizza de
// cidades (números dos rótulos cortavam nas fatias pequenas). Largura do
// eixo de nomes é calculada a partir do maior nome do próprio conjunto de
// dados, então nunca trunca.
function RankingBarChart({
  data,
  color,
  multiColor,
}: {
  data: { name: string; value: number }[];
  color: string;
  multiColor?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        Sem dados para os filtros atuais.
      </div>
    );
  }
  const longest = Math.max(...data.map((d) => d.name.length));
  const nameWidth = Math.min(220, Math.max(90, longest * 7 + 16));
  const height = Math.max(220, data.length * 38 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 28, top: 4, bottom: 4 }}
        barCategoryGap={10}
      >
        <CartesianGrid stroke="rgba(90,145,210,.16)" strokeDasharray="4 6" horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={nameWidth}
          tick={{ fontSize: 12 }}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,132,255,.08)" }} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} maxBarSize={26}>
          {multiColor &&
            data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          <LabelList
            dataKey="value"
            position="right"
            fill="#e2e8f0"
            fontSize={12}
            fontWeight={700}
            style={{ fontVariantNumeric: "tabular-nums" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
