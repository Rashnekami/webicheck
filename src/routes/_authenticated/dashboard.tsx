import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Download, BarChart3, ShieldCheck } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listChecklists } from "@/lib/checklists";
import type { ChecklistData, ChecklistRow } from "@/lib/checklist-schema";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Webifibra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const COLORS = [
  "#1a53ff",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#eab308",
];

const SINTOMA_LABELS: Record<string, string> = {
  ont_nao_liga: "ONT não liga",
  ont_reinicia: "ONT reinicia",
  perde_internet: "Perde internet",
  internet_cai_pon_acesa: "Cai com PON acesa",
  los_acende: "LOS acende",
  wifi_5g_desaparece: "Wi-Fi 5 GHz some",
  wifi_ambas_desaparecem: "Ambas Wi-Fi somem",
  wifi_falha_cabo_ok: "Wi-Fi falha, cabo OK",
  lan_nao_funciona: "LAN não funciona",
  lentidao: "Lentidão",
};

function Dashboard() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!userLoading && user && !user.isAdmin) {
      navigate({ to: "/painel", replace: true });
    }
  }, [user, userLoading, navigate]);

  const query = useQuery({
    queryKey: ["dashboard-checklists"],
    queryFn: () => listChecklists({ scope: "all", userId: user!.id }),
    enabled: !!user?.isAdmin,
  });

  const profilesQuery = useQuery({
    queryKey: ["dashboard-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email");
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

  const ont = useMemo(
    () =>
      (query.data ?? []).filter(
        (c) => c.tipo === "validacao_ont" && c.status === "finalizado",
      ),
    [query.data],
  );

  const stats = useMemo(() => computeStats(ont, nomePorId), [ont, nomePorId]);

  const totalInstalacoes = useMemo(
    () =>
      (query.data ?? []).filter(
        (c) => c.tipo === "instalacao" && c.status === "finalizado",
      ).length,
    [query.data],
  );

  if (userLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WebifibraLogo size={56} className="animate-pulse" />
      </div>
    );
  }
  if (!user.isAdmin) return null;

  function exportCSV() {
    const rows = (query.data ?? []).filter((c) => c.status === "finalizado");
    const header = [
      "numero_publico",
      "codigo_validacao",
      "tipo",
      "finalizado_em",
      "tecnico",
      "cliente",
      "cidade",
      "os",
      "modelo",
      "serial",
      "sintomas",
      "analista_noc",
      "noc_autorizada",
      "motivo",
    ];
    const lines = [header.join(";")];
    for (const c of rows) {
      const tec = nomePorId.get(c.tecnico_id) || c.tecnico_id.slice(0, 8);
      let sintomas = "";
      let analista = "";
      let noc = "";
      let motivo = "";
      if (c.tipo === "validacao_ont") {
        const d = c.dados as ChecklistData;
        sintomas = Object.entries(d.sintoma)
          .filter(([, v]) => v === true)
          .map(([k]) => SINTOMA_LABELS[k] || k)
          .join("|");
        analista = d.noc?.analista || "";
        noc = d.noc?.autorizada || "";
        motivo = d.resultado_final?.motivo || "";
      }
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
          c.modelo || "",
          c.serial || "",
          sintomas,
          analista,
          noc,
          motivo,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      );
    }
    const blob = new Blob([`\ufeff${lines.join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `webifibra-checklists-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return (
    <div className="min-h-screen bg-background pb-12">
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
              <p className="text-xs uppercase tracking-wider opacity-80">
                Webifibra · análise
              </p>
              <h1 className="text-lg font-semibold">Dashboard de trocas de ONT</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/20 text-white">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Admin
            </Badge>
            <Button
              size="sm"
              onClick={exportCSV}
              className="bg-white text-primary hover:bg-white/90"
            >
              <Download className="mr-1.5 h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Carregando dados...
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Trocas de ONT" value={stats.totalOnt} />
              <StatCard label="Instalações" value={totalInstalacoes} />
              <StatCard
                label="Trocas este mês"
                value={stats.esteMes}
                sub={mesAtual()}
              />
              <StatCard
                label="Cidades atendidas"
                value={stats.cidades.length}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Principais problemas"
                subtitle="Sintomas mais frequentes nas trocas"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stats.sintomas} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={130} />
                    <Tooltip />
                    <Bar dataKey="value" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Modelos mais trocados"
                subtitle="Baseado no modelo da ONT registrada"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stats.modelos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Analistas que mais liberaram trocas"
                subtitle="NOC autorizou a troca"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stats.analistas}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Técnicos que mais trocaram"
                subtitle="Ranking por número de checklists finalizados"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stats.tecnicos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard
                title="Cidades com mais trocas"
                subtitle="Distribuição geográfica"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={stats.cidades}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={110}
                      label
                    >
                      {stats.cidades.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
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
                        <th className="px-3 py-2 text-right font-medium">Trocas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.motivosPorCidade.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-muted-foreground">
                            Sem dados ainda.
                          </td>
                        </tr>
                      ) : (
                        stats.motivosPorCidade.map((r) => (
                          <tr key={r.cidade} className="border-t">
                            <td className="px-3 py-2 font-medium">{r.cidade}</td>
                            <td className="px-3 py-2">{r.principal}</td>
                            <td className="px-3 py-2 text-right">{r.total}</td>
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
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function mesAtual() {
  return new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

type Stats = {
  totalOnt: number;
  esteMes: number;
  sintomas: { name: string; value: number }[];
  modelos: { name: string; value: number }[];
  analistas: { name: string; value: number }[];
  tecnicos: { name: string; value: number }[];
  cidades: { name: string; value: number }[];
  motivosPorCidade: { cidade: string; principal: string; total: number }[];
};

function computeStats(ont: ChecklistRow[], nomes: Map<string, string>): Stats {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const sintomasCount: Record<string, number> = {};
  const modelosCount: Record<string, number> = {};
  const analistasCount: Record<string, number> = {};
  const tecnicosCount: Record<string, number> = {};
  const cidadesCount: Record<string, number> = {};
  const cidadeSintomas: Record<string, Record<string, number>> = {};
  let esteMes = 0;

  for (const c of ont) {
    if (c.finalizado_em?.slice(0, 7) === ym) esteMes++;
    const d = c.dados as ChecklistData;

    for (const [k, v] of Object.entries(d.sintoma || {})) {
      if (v === true) {
        const label = SINTOMA_LABELS[k] || k;
        sintomasCount[label] = (sintomasCount[label] || 0) + 1;
      }
    }

    const modelo = (c.modelo || "").trim();
    if (modelo) modelosCount[modelo] = (modelosCount[modelo] || 0) + 1;

    if (d.noc?.autorizada === "sim") {
      const a = (d.noc.analista || "").trim() || "(sem nome)";
      analistasCount[a] = (analistasCount[a] || 0) + 1;
    }

    const tec = nomes.get(c.tecnico_id) || c.tecnico_id.slice(0, 8);
    tecnicosCount[tec] = (tecnicosCount[tec] || 0) + 1;

    const cidade = (c.cidade || "").trim() || "(sem cidade)";
    cidadesCount[cidade] = (cidadesCount[cidade] || 0) + 1;

    if (!cidadeSintomas[cidade]) cidadeSintomas[cidade] = {};
    for (const [k, v] of Object.entries(d.sintoma || {})) {
      if (v === true) {
        const label = SINTOMA_LABELS[k] || k;
        cidadeSintomas[cidade][label] =
          (cidadeSintomas[cidade][label] || 0) + 1;
      }
    }
  }

  const toArr = (r: Record<string, number>, limit = 10) =>
    Object.entries(r)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

  const motivosPorCidade = Object.entries(cidadeSintomas)
    .map(([cidade, syms]) => {
      const top = Object.entries(syms).sort((a, b) => b[1] - a[1])[0];
      return {
        cidade,
        principal: top ? top[0] : "—",
        total: cidadesCount[cidade] || 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    totalOnt: ont.length,
    esteMes,
    sintomas: toArr(sintomasCount, 10),
    modelos: toArr(modelosCount, 8),
    analistas: toArr(analistasCount, 8),
    tecnicos: toArr(tecnicosCount, 8),
    cidades: toArr(cidadesCount, 8),
    motivosPorCidade,
  };
}
