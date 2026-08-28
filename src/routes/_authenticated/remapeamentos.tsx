import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteChecklistCascade } from "@/lib/platform-admin.functions";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BASEMAP_OPTIONS,
  DEFAULT_BASEMAP_MODE,
  MAP_ATTRIBUTION_NOTE,
  basemapStyleFor,
  basemapStyleUrl,
  type BasemapMode,
} from "@/lib/map-basemaps";
import { useArcgisBrowserKey } from "@/lib/use-arcgis-key";
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  Wifi,
} from "lucide-react";

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
import { computeSplitterStats } from "@/lib/remapeamento-fibers";
import { listCtoCoverage, listCtoReferencePoints } from "@/lib/cto-reference.functions";
import type { IntervencaoData, MapAtivoTipo, RemapeamentoData } from "@/lib/checklist-schema";
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

export const Route = createFileRoute("/_authenticated/remapeamentos")({
  head: () => ({
    meta: [{ title: "Remapeamentos — CheckTecnico" }, { name: "robots", content: "noindex" }],
  }),
  component: RemapeamentosPage,
});

type RemapRow = {
  id: string;
  tecnico_id: string;
  cidade: string | null;
  finalizado_em: string | null;
  created_at: string;
  updated_at: string;
  review_status: string | null;
  rmap_code: string | null;
  numero_publico: string | null;
  codigo_validacao: string | null;
  dados: RemapeamentoData;
  tecnico_nome: string;
};

async function listRemapeamentos(): Promise<RemapRow[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select("id,tecnico_id,cidade,finalizado_em,created_at,updated_at,review_status,rmap_code,numero_publico,codigo_validacao,dados,is_current,tipo,status")
    .eq("tipo", "remapeamento_cto")
    .eq("status", "finalizado")
    .eq("is_current", true)
    .order("finalizado_em", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.tecnico_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as any[] };
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, (p.full_name || "").trim()]));
  return rows.map((r) => ({
    ...r,
    dados: (r.dados ?? {}) as RemapeamentoData,
    tecnico_nome: nameById.get(r.tecnico_id) || "Técnico não identificado",
  })) as RemapRow[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function useRemapeamentos(enabled: boolean) {
  return useQuery({ queryKey: ["remapeamentos"], queryFn: listRemapeamentos, enabled });
}

/** Ponto de CTO/CEO georreferenciado extraído de QUALQUER checklist que o
 * confirma — não só remapeamento_cto. Intervenções de rede (rompimento,
 * readequação, melhoria de sinal) também têm o técnico confirmando a
 * posição da CTO/CEO em campo (`dados.rota.pontos`), e até agora o mapa
 * de Remapeamentos ignorava essas confirmações inteiramente. */
type NapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  ativoTipo: MapAtivoTipo;
  cidade: string | null;
  tecnico_id: string;
  tecnico_nome: string;
  checklistId: string;
  origemTipo: "rompimento" | "readequacao" | "melhoria_sinal";
  finalizado_em: string | null;
};

async function listIntervencaoNapPoints(): Promise<NapPoint[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select("id,tecnico_id,cidade,finalizado_em,dados,tipo")
    .in("tipo", ["rompimento", "readequacao", "melhoria_sinal"])
    .eq("status", "finalizado")
    .eq("is_current", true)
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.tecnico_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as any[] };
  const nameById = new Map<string, string>(
    (profiles ?? []).map((p: any) => [p.id as string, ((p.full_name as string) || "").trim()]),
  );

  const points: NapPoint[] = [];
  for (const row of rows) {
    const dados = (row.dados ?? {}) as IntervencaoData;
    const pontos = dados?.rota?.pontos ?? [];
    for (const p of pontos) {
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      if (p.tipo !== "CTO" && p.tipo !== "CEO") continue;
      points.push({
        id: `${row.id}:${p.id}`,
        lat: p.lat,
        lng: p.lng,
        label: dados?.contexto?.cto_codigo || p.descricao || p.tipo,
        ativoTipo: p.tipo,
        cidade: row.cidade,
        tecnico_id: row.tecnico_id,
        tecnico_nome: nameById.get(row.tecnico_id) || "Técnico não identificado",
        checklistId: row.id,
        origemTipo: row.tipo,
        finalizado_em: row.finalizado_em,
      });
    }
  }
  return points;
}

function useIntervencaoNapPoints(enabled: boolean) {
  return useQuery({
    queryKey: ["remapeamentos-nap-intervencoes"],
    queryFn: listIntervencaoNapPoints,
    enabled,
  });
}

function RemapeamentosPage() {
  const { data: user, isLoading } = useCurrentUser();
  const canSeeAll = !!(user?.isAdmin || user?.isSupervisor || user?.isNoc || user?.isPlatformAdmin);
  const canSee = !!user;
  const query = useRemapeamentos(canSee);
  const napQuery = useIntervencaoNapPoints(canSee);

  const [search, setSearch] = useState("");
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
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((r) => {
      if (cityFilter !== "all" && r.cidade !== cityFilter) return false;
      if (tecFilter !== "all" && r.tecnico_id !== tecFilter) return false;
      if (!needle) return true;
      const values = [
        r.rmap_code,
        r.numero_publico,
        r.codigo_validacao,
        r.cidade,
        r.tecnico_nome,
        r.dados?.identificacao?.cto_codigo,
        r.dados?.identificacao?.setor,
      ];
      return values.some((v) => v?.toLocaleString().toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [rows, search, cityFilter, tecFilter]);

  const napPoints = napQuery.data ?? [];
  const filteredNapPoints = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return napPoints.filter((p) => {
      if (cityFilter !== "all" && p.cidade !== cityFilter) return false;
      if (tecFilter !== "all" && p.tecnico_id !== tecFilter) return false;
      if (!needle) return true;
      const values = [p.label, p.cidade, p.tecnico_nome];
      return values.some((v) => v?.toLocaleString().toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [napPoints, search, cityFilter, tecFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
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
            <MapPin className="h-5 w-5" />
          </span>
          Remapeamentos
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhamento das CTOs/NAPs remapeadas: código RMAP, portas, potência, mapa satélite e
          indicadores. {canSeeAll ? "Você vê todos do provedor." : "Você vê os seus."}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RMAP, CTO, cidade, setor ou técnico"
          />
        </div>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Cidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as cidades</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {canSeeAll && (
          <Select value={tecFilter} onValueChange={setTecFilter}>
            <SelectTrigger className="sm:w-52"><SelectValue placeholder="Técnico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os técnicos</SelectItem>
              {tecnicos.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="lista">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista"><Wifi className="mr-1.5 h-4 w-4" /> Lista</TabsTrigger>
          <TabsTrigger value="mapa"><MapIcon className="mr-1.5 h-4 w-4" /> Mapa</TabsTrigger>
          <TabsTrigger value="indicadores"><BarChart3 className="mr-1.5 h-4 w-4" /> Indicadores</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="pt-4">
          {query.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum remapeamento encontrado.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((r) => (
                <RemapCard
                  key={r.id}
                  row={r}
                  canDelete={!!(user?.isAdmin || user?.isPlatformAdmin)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mapa" className="pt-4">
          <RemapMap rows={filtered} napPoints={filteredNapPoints} />
        </TabsContent>

        <TabsContent value="indicadores" className="pt-4">
          <RemapIndicators rows={filtered} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RemapCard({ row, canDelete }: { row: RemapRow; canDelete?: boolean }) {
  const stats = computeSplitterStats(row.dados);
  const cto = row.dados?.identificacao?.cto_codigo || "—";
  const setor = row.dados?.identificacao?.setor || "";
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteChecklistCascade({ data: { checklistId: row.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["remapeamentos"] });
      toast.success("Remapeamento apagado.");
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível apagar."),
  });
  return (
    <Card className="webi-nav-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-cyan-400">{row.rmap_code || "RMAP pendente"}</p>
            <p className="text-sm font-medium">CTO {cto}</p>
            {setor && <p className="text-xs text-muted-foreground">Setor: {setor}</p>}
          </div>
          {row.review_status === "aprovado" && <Badge className="bg-emerald-500/15 text-emerald-300">Aprovado</Badge>}
          {row.review_status === "reprovado" && <Badge className="bg-rose-500/15 text-rose-300">Reprovado</Badge>}
          {row.review_status === "pendente" && <Badge className="bg-amber-500/15 text-amber-300">Em revisão</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-muted-foreground">Cidade</dt><dd>{row.cidade || "—"}</dd></div>
          <div><dt className="text-muted-foreground">Técnico</dt><dd>{row.tecnico_nome}</dd></div>
          <div><dt className="text-muted-foreground">Splitter</dt><dd>{row.dados?.splitter?.tipo ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Portas</dt>
            <dd>{stats.ocupadas}/{stats.total} ocupadas · {stats.livres} livres</dd>
          </div>
          <div><dt className="text-muted-foreground">Entrada</dt>
            <dd>{stats.entrada_dbm !== null ? `${stats.entrada_dbm} dBm` : "—"}</dd>
          </div>
          <div><dt className="text-muted-foreground">Média saídas</dt>
            <dd>{stats.media_saida_dbm !== null ? `${stats.media_saida_dbm} dBm` : "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Finalizado em {row.finalizado_em ? new Date(row.finalizado_em).toLocaleString("pt-BR") : "—"}
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/checklists/$id" params={{ id: row.id }}>Abrir remapeamento</Link>
          </Button>
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  confirm(
                    `Apagar remapeamento ${row.rmap_code || row.id}? Esta ação é permanente e remove fotos, snapshots e contra-provas vinculadas.`,
                  )
                )
                  remove.mutate();
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const INTERVENCAO_ORIGEM_LABEL: Record<NapPoint["origemTipo"], string> = {
  rompimento: "Rompimento",
  readequacao: "Readequação",
  melhoria_sinal: "Melhoria de sinal",
};

type MapPoint =
  | { kind: "remapeamento"; row: RemapRow; pos: { lat: number; lng: number } }
  | { kind: "intervencao"; nap: NapPoint; pos: { lat: number; lng: number } };

function RemapMap({ rows, napPoints }: { rows: RemapRow[]; napPoints: NapPoint[] }) {
  const { key: apiKey, loading: keyLoading } = useArcgisBrowserKey();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const basemapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mode, setMode] = useState<BasemapMode>(DEFAULT_BASEMAP_MODE);
  // O mapa é criado assim que a chave ArcGIS chega, o que quase sempre
  // acontece ANTES dos remapeamentos terminarem de carregar (useQuery
  // assíncrono). Sem este estado, o efeito que desenha os marcadores só
  // reagia a mudanças em `points` — se `points` ainda estivesse vazio no
  // instante exato em que o mapa terminava de ser instanciado, o efeito
  // rodava com `map` nulo, saía sem fazer nada, e nunca era re-executado
  // depois (o mapa ficava preso no centro padrão/fallback, sem marcador
  // nenhum, mesmo a legenda dizendo "N de N exibidos no mapa").
  const [mapReady, setMapReady] = useState(false);

  const remapPoints = useMemo(
    () =>
      rows
        .map((r) => {
          const loc = r.dados?.localizacao;
          const pos = loc?.ativo?.confirmed ? loc.ativo : loc?.confirmada;
          return { row: r, pos: pos as { lat: number; lng: number } | undefined };
        })
        .filter((p): p is { row: RemapRow; pos: { lat: number; lng: number } } => !!p.pos),
    [rows],
  );

  // Une as CTOs/NAPs confirmadas em remapeamento_cto com as confirmadas em
  // checklists de intervenção (rompimento/readequação/melhoria de sinal) —
  // antes o mapa só mostrava a primeira, deixando de fora toda confirmação
  // de campo feita durante uma intervenção de rede.
  const points: MapPoint[] = useMemo(
    () => [
      ...remapPoints.map((p): MapPoint => ({ kind: "remapeamento", row: p.row, pos: p.pos })),
      ...napPoints.map((n): MapPoint => ({ kind: "intervencao", nap: n, pos: { lat: n.lat, lng: n.lng } })),
    ],
    [remapPoints, napPoints],
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
        attributionControl: {
          compact: true,
          customAttribution: MAP_ATTRIBUTION_NOTE,
        },
      });
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!mapRef.current || !apiKey) return;
    mapRef.current.setStyle(basemapStyleUrl(basemapStyleFor(mode), apiKey));
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !mapRef.current) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const bounds = new maplibre.LngLatBounds();
      for (const p of points) {
        const el = document.createElement("div");
        const isRemap = p.kind === "remapeamento";
        const pinColor = isRemap ? "#e11d48" : "#f59e0b";
        el.innerHTML = `<svg width="22" height="28" viewBox="0 0 24 32"><path d="M12 0C5.9 0 1 4.9 1 11c0 8 11 21 11 21s11-13 11-21C23 4.9 18.1 0 12 0z" fill="${pinColor}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11" r="4" fill="#fff"/></svg>`;

        let html: string;
        let checklistId: string;
        if (p.kind === "remapeamento") {
          const stats = computeSplitterStats(p.row.dados);
          checklistId = p.row.id;
          html = `<div style="font-family:system-ui;color:#0f172a;min-width:200px">
            <div style="font-weight:700;color:#0369a1">${escapeHtml(p.row.rmap_code || "RMAP")}</div>
            <div style="font-size:12px">CTO ${escapeHtml(p.row.dados?.identificacao?.cto_codigo || "—")}</div>
            <div style="font-size:12px">${escapeHtml(p.row.cidade || "")}</div>
            <div style="font-size:12px;margin-top:4px">${stats.ocupadas}/${stats.total} portas ocupadas</div>
            <a href="/checklists/${checklistId}" style="display:inline-block;margin-top:6px;color:#0369a1;font-weight:600;font-size:12px">Abrir remapeamento →</a>
          </div>`;
        } else {
          checklistId = p.nap.checklistId;
          html = `<div style="font-family:system-ui;color:#0f172a;min-width:200px">
            <div style="font-weight:700;color:#b45309">${escapeHtml(p.nap.ativoTipo)} ${escapeHtml(p.nap.label)}</div>
            <div style="font-size:12px">Confirmada durante: ${escapeHtml(INTERVENCAO_ORIGEM_LABEL[p.nap.origemTipo])}</div>
            <div style="font-size:12px">${escapeHtml(p.nap.cidade || "")} · ${escapeHtml(p.nap.tecnico_nome)}</div>
            <a href="/checklists/${checklistId}" style="display:inline-block;margin-top:6px;color:#0369a1;font-weight:600;font-size:12px">Abrir checklist →</a>
          </div>`;
        }

        const popup = new maplibre.Popup({ offset: 24 }).setHTML(html);
        const marker = new maplibre.Marker({ element: el, anchor: "bottom" })
          .setLngLat([p.pos.lng, p.pos.lat])
          .setPopup(popup)
          .addTo(mapRef.current);
        markersRef.current.push(marker);
        bounds.extend([p.pos.lng, p.pos.lat]);
      }
      if (points.length > 1) mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 18 });
      else if (points.length === 1)
        mapRef.current.flyTo({ center: [points[0].pos.lng, points[0].pos.lat], zoom: 18 });
    })();
    return () => {
      cancelled = true;
    };
  }, [points, mapReady]);

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
        {remapPoints.length} de {rows.length} remapeamentos + {napPoints.length} CTO/CEO confirmadas em
        intervenções de rede exibidas no mapa · {MAP_ATTRIBUTION_NOTE}
      </p>
      <div ref={ref} className="h-[520px] w-full overflow-hidden rounded-xl border border-blue-500/40" />
    </div>
  );
}

function CtoCoverage() {
  const q = useQuery({
    queryKey: ["cto-coverage"],
    queryFn: () => listCtoCoverage(),
    staleTime: 60_000,
  });
  const data = q.data ?? [];

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-1 text-sm font-semibold">Cobertura de remapeamento por cidade</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Compara o total de CTOs cadastradas no OZmap (última planilha importada em /ctos) com o
          que já foi remapeado no sistema.
        </p>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : q.isError ? (
          <p className="text-sm text-rose-400">
            Falha ao carregar: {q.error instanceof Error ? q.error.message : "erro desconhecido"}.
            Confirme se a migration de referência de CTO já foi aplicada.
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma referência de CTO salva ainda. Importe a planilha em{" "}
            <Link to="/ctos" className="underline">
              /ctos
            </Link>{" "}
            e clique em "Salvar {"{cidade}"}" pra gerar o primeiro snapshot.
          </p>
        ) : (
          <div className="space-y-2">
            {data.map((c) => (
              <div key={c.cidade} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{c.cidade}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.remapeadas}/{c.total} · {c.percentual}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(c.percentual, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RemapIndicators({ rows }: { rows: RemapRow[] }) {
  const now = Date.now();
  const day = 86_400_000;
  const hoje = rows.filter((r) => r.finalizado_em && now - new Date(r.finalizado_em).getTime() < day).length;
  const semana = rows.filter((r) => r.finalizado_em && now - new Date(r.finalizado_em).getTime() < 7 * day).length;
  const mes = rows.filter((r) => r.finalizado_em && now - new Date(r.finalizado_em).getTime() < 30 * day).length;
  const ctos = new Set(rows.map((r) => r.dados?.identificacao?.cto_codigo).filter(Boolean)).size;
  const pendentes = rows.filter((r) => r.review_status === "pendente").length;
  const totals = rows.reduce(
    (acc, r) => {
      const s = computeSplitterStats(r.dados);
      acc.portas += s.total;
      acc.ocupadas += s.ocupadas;
      acc.livres += s.livres;
      return acc;
    },
    { portas: 0, ocupadas: 0, livres: 0 },
  );

  const perMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.finalizado_em) continue;
      const d = new Date(r.finalizado_em);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({ mes: m, total: v }));
  }, [rows]);

  const perTech = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.tecnico_nome, (map.get(r.tecnico_nome) ?? 0) + 1);
    return [...map.entries()]
      .map(([tecnico, total]) => ({ tecnico, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [rows]);

  return (
    <div className="space-y-4">
      <CtoCoverage />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={rows.length} />
        <Stat label="Hoje" value={hoje} />
        <Stat label="7 dias" value={semana} />
        <Stat label="30 dias" value={mes} />
        <Stat label="CTOs únicas" value={ctos} />
        <Stat label="Portas mapeadas" value={totals.portas} />
        <Stat label="Portas ocupadas" value={totals.ocupadas} />
        <Stat label="Pendentes revisão" value={pendentes} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Remapeamentos por mês</h3>
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
            <h3 className="mb-2 text-sm font-semibold">Ranking por técnico</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perTech} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="tecnico" fontSize={11} width={120} />
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
