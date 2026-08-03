import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ArrowLeft,
  BarChart3,
  List,
  Map as MapIcon,
  Search,
  Zap,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useArcgisBrowserKey } from "@/lib/use-arcgis-key";
import {
  BASEMAP_OPTIONS,
  DEFAULT_BASEMAP_MODE,
  MAP_ATTRIBUTION_NOTE,
  basemapStyleFor,
  basemapStyleUrl,
  type BasemapMode,
} from "@/lib/map-basemaps";
import {
  CAUSA_OPCOES,
  ESTADO_LABEL,
  PONTO_COLOR,
  URGENCIA_LABEL,
  routeLengthMeters,
  signalGainDb,
} from "@/lib/intervencao";
import {
  TIPOS_INTERVENCAO,
  TIPO_LABEL,
  type IntervencaoData,
  type TipoIntervencao,
} from "@/lib/checklist-schema";

export const Route = createFileRoute("/_authenticated/intervencoes")({
  head: () => ({
    meta: [
      { title: "Intervenções de rede — CheckTecnico" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntervencoesPage,
});

type IntervRow = {
  id: string;
  tipo: TipoIntervencao;
  tecnico_id: string;
  cidade: string | null;
  os: string | null;
  cliente: string | null;
  finalizado_em: string | null;
  review_status: string | null;
  intervention_code: string | null;
  numero_publico: string | null;
  codigo_validacao: string | null;
  dados: IntervencaoData;
  tecnico_nome: string;
};

async function listIntervencoes(): Promise<IntervRow[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select(
      "id,tipo,tecnico_id,cidade,os,cliente,finalizado_em,review_status,intervention_code,numero_publico,codigo_validacao,dados,is_current,status",
    )
    .in("tipo", TIPOS_INTERVENCAO)
    .eq("status", "finalizado")
    .eq("is_current", true)
    .order("finalizado_em", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as IntervRow[];
  const ids = [...new Set(rows.map((r) => r.tecnico_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, (p.full_name || "").trim()]),
  );
  return rows.map((r) => ({
    ...r,
    dados: (r.dados ?? {}) as IntervencaoData,
    tecnico_nome: nameById.get(r.tecnico_id) || "Técnico não identificado",
  }));
}

function causaLabel(row: IntervRow): string {
  const opts = CAUSA_OPCOES[row.tipo] ?? [];
  const causa = row.dados?.contexto?.causa;
  return opts.find((o) => o.value === causa)?.label || causa || "—";
}

function firstPoint(row: IntervRow): { lat: number; lng: number } | null {
  const pts = row.dados?.rota?.pontos ?? [];
  const rompimento = pts.find((p) => p.tipo === "ROMPIMENTO");
  const p = rompimento ?? pts[0];
  return p ? { lat: p.lat, lng: p.lng } : null;
}

function IntervencoesPage() {
  const { data: user, isLoading } = useCurrentUser();
  const canSeeAll = !!(user?.isAdmin || user?.isSupervisor || user?.isNoc || user?.isPlatformAdmin);
  const query = useQuery({
    queryKey: ["intervencoes"],
    queryFn: listIntervencoes,
    enabled: !!user,
  });

  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [tecFilter, setTecFilter] = useState<string>("all");

  const rows = query.data ?? [];

  const cities = useMemo(
    () => [...new Set(rows.map((r) => r.cidade).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const tecnicos = useMemo(
    () =>
      [...new Map(rows.map((r) => [r.tecnico_id, r.tecnico_nome])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1], "pt-BR"),
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tipoFilter !== "all" && r.tipo !== tipoFilter) return false;
      if (cityFilter !== "all" && r.cidade !== cityFilter) return false;
      if (tecFilter !== "all" && r.tecnico_id !== tecFilter) return false;
      if (!q) return true;
      return [
        r.intervention_code,
        r.numero_publico,
        r.cidade,
        r.os,
        r.cliente,
        r.tecnico_nome,
        r.dados?.contexto?.cto_codigo,
        r.dados?.contexto?.descricao,
        TIPO_LABEL[r.tipo],
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, tipoFilter, cityFilter, tecFilter]);

  if (isLoading) {
    return <p className="p-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="webi-page mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header p-5 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <span className="webi-icon h-11 w-11">
            <Zap className="h-5 w-5" />
          </span>
          Intervenções de rede
        </h1>
        <p className="text-sm text-muted-foreground">
          Rompimentos, readequações e melhorias de sinal: rota georreferenciada, materiais, OTDR e
          indicadores. {canSeeAll ? "Você vê todas do provedor." : "Você vê as suas."}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, cidade, CTO, OS ou técnico"
          />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TIPOS_INTERVENCAO.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Cidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canSeeAll && (
          <Select value={tecFilter} onValueChange={setTecFilter}>
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="Técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os técnicos</SelectItem>
              {tecnicos.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="lista">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">
            <List className="mr-1.5 h-4 w-4" /> Lista
          </TabsTrigger>
          <TabsTrigger value="mapa">
            <MapIcon className="mr-1.5 h-4 w-4" /> Mapa
          </TabsTrigger>
          <TabsTrigger value="indicadores">
            <BarChart3 className="mr-1.5 h-4 w-4" /> Indicadores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="pt-4">
          {query.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma intervenção encontrada.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((r) => (
                <IntervCard key={r.id} row={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mapa" className="pt-4">
          <IntervMap rows={filtered} />
        </TabsContent>

        <TabsContent value="indicadores" className="pt-4">
          <IntervIndicators rows={filtered} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IntervCard({ row }: { row: IntervRow }) {
  const pontos = row.dados?.rota?.pontos ?? [];
  const extensao = routeLengthMeters(pontos);
  const ganho = signalGainDb(row.dados?.sinal?.antes_dbm, row.dados?.sinal?.depois_dbm);
  const estado = row.dados?.resultado?.estado;

  return (
    <Card className="webi-nav-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-cyan-400">
              {row.intervention_code || "Código pendente"}
            </p>
            <p className="text-sm font-medium">{TIPO_LABEL[row.tipo]}</p>
            <p className="text-xs text-muted-foreground">{causaLabel(row)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {estado && (
              <Badge
                className={
                  estado === "resolvido"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : estado === "paliativo"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-rose-500/15 text-rose-300"
                }
              >
                {ESTADO_LABEL[estado] ?? estado}
              </Badge>
            )}
            {row.review_status === "pendente" && (
              <Badge className="bg-amber-500/15 text-amber-300">Em revisão</Badge>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Cidade</dt>
            <dd>{row.cidade || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Técnico</dt>
            <dd>{row.tecnico_nome}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Urgência</dt>
            <dd>
              {row.dados?.contexto?.urgencia
                ? (URGENCIA_LABEL[row.dados.contexto.urgencia] ?? row.dados.contexto.urgencia)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Clientes afetados</dt>
            <dd>{row.dados?.contexto?.afetados_estimados || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Extensão da rota</dt>
            <dd>{extensao > 0 ? `${Math.round(extensao)} m` : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fusões</dt>
            <dd>{row.dados?.materiais?.fusoes_qtd || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ganho óptico</dt>
            <dd>{ganho !== null ? `${ganho > 0 ? "+" : ""}${ganho.toFixed(2)} dB` : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Laudos OTDR</dt>
            <dd>{row.dados?.otdr?.laudos?.length ?? 0}</dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          Finalizado em{" "}
          {row.finalizado_em ? new Date(row.finalizado_em).toLocaleString("pt-BR") : "—"}
        </p>
        <div>
          <Button asChild size="sm" variant="outline">
            <Link to="/checklists/$id" params={{ id: row.id }}>
              Abrir intervenção
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IntervMap({ rows }: { rows: IntervRow[] }) {
  const { key: apiKey, loading: keyLoading } = useArcgisBrowserKey();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mode, setMode] = useState<BasemapMode>(DEFAULT_BASEMAP_MODE);

  const points = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, pos: firstPoint(r) }))
        .filter((p): p is { row: IntervRow; pos: { lat: number; lng: number } } => !!p.pos),
    [rows],
  );

  useEffect(() => {
    if (!apiKey || !ref.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !ref.current) return;
      const map = new maplibre.Map({
        container: ref.current,
        style: basemapStyleUrl(basemapStyleFor(DEFAULT_BASEMAP_MODE), apiKey),
        center: [points[0]?.pos.lng ?? -50.6156, points[0]?.pos.lat ?? -24.3269],
        zoom: points.length ? 13 : 10,
        maxZoom: 22,
        attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION_NOTE },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!mapRef.current || !apiKey) return;
    mapRef.current.setStyle(basemapStyleUrl(basemapStyleFor(mode), apiKey));
  }, [mode, apiKey]);

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !mapRef.current) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const bounds = new maplibre.LngLatBounds();
      for (const p of points) {
        const color = PONTO_COLOR[p.row.tipo === "rompimento" ? "ROMPIMENTO" : "CTO"] ?? "#e11d48";
        const el = document.createElement("div");
        el.innerHTML = `<svg width="22" height="28" viewBox="0 0 24 32"><path d="M12 0C5.9 0 1 4.9 1 11c0 8 11 21 11 21s11-13 11-21C23 4.9 18.1 0 12 0z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11" r="4" fill="#fff"/></svg>`;
        const popup = new maplibre.Popup({ offset: 24 }).setHTML(
          `<div style="font-family:system-ui;color:#0f172a;min-width:210px">
            <div style="font-weight:700;color:#0369a1">${p.row.intervention_code || "Intervenção"}</div>
            <div style="font-size:12px">${TIPO_LABEL[p.row.tipo]}</div>
            <div style="font-size:12px">${p.row.cidade || ""}</div>
            <div style="font-size:12px;margin-top:4px">${causaLabel(p.row)}</div>
            <a href="/checklists/${p.row.id}" style="display:inline-block;margin-top:6px;color:#0369a1;font-weight:600;font-size:12px">Abrir intervenção →</a>
          </div>`,
        );
        const marker = new maplibre.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.pos.lng, p.pos.lat])
          .setPopup(popup)
          .addTo(mapRef.current);
        markersRef.current.push(marker);
        bounds.extend([p.pos.lng, p.pos.lat]);
      }
      if (points.length > 1) mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 18 });
      else if (points.length === 1)
        mapRef.current.flyTo({ center: [points[0].pos.lng, points[0].pos.lat], zoom: 17 });
    })();
    return () => {
      cancelled = true;
    };
  }, [points]);

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-blue-500/30 bg-[#041126] p-4 text-sm text-slate-400">
        {keyLoading
          ? "Carregando cartografia…"
          : "Chave de basemaps do ArcGIS (ARCGIS_WEB_API_KEY) não configurada — mapa indisponível."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {BASEMAP_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setMode(opt.mode)}
            className={
              "rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition " +
              (mode === opt.mode
                ? "border-cyan-400 bg-blue-600 text-white"
                : "border-blue-500/40 bg-[#071b3a] text-slate-300")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {points.length} de {rows.length} intervenções georreferenciadas exibidas ·{" "}
        {MAP_ATTRIBUTION_NOTE}
      </p>
      <div
        ref={ref}
        className="h-[520px] w-full overflow-hidden rounded-xl border border-blue-500/40"
      />
    </div>
  );
}

function IntervIndicators({ rows }: { rows: IntervRow[] }) {
  const now = Date.now();
  const day = 86_400_000;
  const inWindow = (r: IntervRow, days: number) =>
    r.finalizado_em && now - new Date(r.finalizado_em).getTime() < days * day;

  const resolvidos = rows.filter((r) => r.dados?.resultado?.estado === "resolvido").length;
  const pendentes = rows.filter((r) => r.dados?.resultado?.estado === "pendente").length;
  const fusoes = rows.reduce(
    (acc, r) => acc + (Number(r.dados?.materiais?.fusoes_qtd) || 0),
    0,
  );
  const metros = rows.reduce(
    (acc, r) => acc + (Number(r.dados?.materiais?.cabo_metros) || 0),
    0,
  );
  const afetados = rows.reduce(
    (acc, r) => acc + (Number(r.dados?.contexto?.afetados_estimados) || 0),
    0,
  );

  const perMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.finalizado_em) continue;
      const d = new Date(r.finalizado_em);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, total]) => ({ mes, total }));
  }, [rows]);

  const perCausa = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const label = causaLabel(r);
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([causa, total]) => ({ causa, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={rows.length} />
        <Stat label="7 dias" value={rows.filter((r) => inWindow(r, 7)).length} />
        <Stat label="30 dias" value={rows.filter((r) => inWindow(r, 30)).length} />
        <Stat label="Resolvidas" value={resolvidos} />
        <Stat label="Pendentes" value={pendentes} />
        <Stat label="Fusões executadas" value={fusoes} />
        <Stat label="Cabo aplicado (m)" value={metros} />
        <Stat label="Clientes afetados" value={afetados} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Intervenções por mês</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perMonth}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="mes" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Principais causas</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perCausa} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="causa" fontSize={10} width={160} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
