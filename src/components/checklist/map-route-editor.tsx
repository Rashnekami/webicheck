import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MapPin, Plus, Trash2 } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  BASEMAP_OPTIONS,
  DEFAULT_BASEMAP_MODE,
  MAP_ATTRIBUTION_NOTE,
  basemapModeForStyle,
  basemapStyleFor,
  basemapStyleUrl,
  type BasemapMode,
} from "@/lib/map-basemaps";
import { useArcgisBrowserKey } from "@/lib/use-arcgis-key";
import { PONTO_COLOR, PONTO_LABEL, routeLengthMeters } from "@/lib/intervencao";
import type { IntervencaoPonto, MapAtivoTipo } from "@/lib/checklist-schema";

type Point = { lat: number; lng: number };

type Props = {
  points: IntervencaoPonto[];
  userLocation?: (Point & { accuracy_m?: number | null }) | null;
  readOnly?: boolean;
  initialStyle?: string | null;
  allowedTypes?: MapAtivoTipo[];
  onChange: (next: IntervencaoPonto[], meta: { basemap_style: string; zoom: number }) => void;
};

const DEFAULT_TYPES: MapAtivoTipo[] = [
  "INICIO",
  "ROMPIMENTO",
  "FUSAO",
  "POSTE",
  "CTO",
  "CEO",
  "CAIXA_EMENDA",
  "FIM",
  "OUTRO",
];

function pinSvg(color: string, label: string) {
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:grab">
    <span style="margin-bottom:2px;font:800 9px/1 system-ui;color:#fff;background:${color};border-radius:4px;padding:2px 5px;white-space:nowrap">${label}</span>
    <svg width="24" height="31" viewBox="0 0 24 32"><path d="M12 0C5.9 0 1 4.9 1 11c0 8 11 21 11 21s11-13 11-21C23 4.9 18.1 0 12 0z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11" r="4" fill="#fff"/></svg>
  </div>`;
}

/**
 * Editor cartográfico multiponto das intervenções de rede.
 *
 * Regras:
 * - O GPS representa o TÉCNICO: apenas centraliza a câmera, nunca grava pontos.
 * - Cada ponto da rota é criado e posicionado manualmente pelo técnico.
 * - A linha entre os pontos representa a rota na ordem cadastrada.
 */
export function MapRouteEditor({
  points,
  userLocation,
  readOnly,
  initialStyle,
  allowedTypes = DEFAULT_TYPES,
  onChange,
}: Props) {
  const { key: apiKey, loading: keyLoading } = useArcgisBrowserKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const [mode, setMode] = useState<BasemapMode>(
    initialStyle ? basemapModeForStyle(initialStyle) : DEFAULT_BASEMAP_MODE,
  );
  const [newType, setNewType] = useState<MapAtivoTipo>(allowedTypes[0]);
  const [error, setError] = useState<string | null>(null);

  const initialCenter = useMemo<Point>(
    () => points[0] ?? userLocation ?? { lat: -24.3269, lng: -50.6156 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const meta = () => ({
    basemap_style: basemapStyleFor(mode),
    zoom: Math.round((mapRef.current?.getZoom?.() ?? 18) * 100) / 100,
  });

  const emit = (next: IntervencaoPonto[]) => onChange(next, meta());

  // Inicialização do mapa
  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        const map = new maplibre.Map({
          container: containerRef.current,
          style: basemapStyleUrl(basemapStyleFor(mode), apiKey),
          center: [initialCenter.lng, initialCenter.lat],
          zoom: points.length ? 17 : 15,
          maxZoom: 22,
          attributionControl: { compact: true, customAttribution: MAP_ATTRIBUTION_NOTE },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        if (userLocation) {
          const gpsEl = document.createElement("div");
          gpsEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="width:16px;height:16px;border-radius:50%;background:#00c6ff;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,198,255,.25)"></div>
            <span style="margin-top:2px;font:700 9px/1 system-ui;color:#fff;text-shadow:0 1px 3px #000">TÉCNICO</span>
          </div>`;
          new maplibre.Marker({ element: gpsEl })
            .setLngLat([userLocation.lng, userLocation.lat])
            .addTo(map);
        }

        map.on("load", () => {
          map.addSource("rota", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
          map.addLayer({
            id: "rota-line",
            type: "line",
            source: "rota",
            paint: { "line-color": "#22d3ee", "line-width": 3, "line-dasharray": [2, 1] },
          });
          syncLine();
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao carregar o mapa.");
      }
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
    const map = mapRef.current;
    map.setStyle(basemapStyleUrl(basemapStyleFor(mode), apiKey));
    map.once("styledata", () => {
      if (map.getSource("rota")) return;
      map.addSource("rota", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "rota-line",
        type: "line",
        source: "rota",
        paint: { "line-color": "#22d3ee", "line-width": 3, "line-dasharray": [2, 1] },
      });
      syncLine();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function syncLine() {
    const map = mapRef.current;
    const src = map?.getSource?.("rota");
    if (!src) return;
    src.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: pointsRef.current.map((p) => [p.lng, p.lat]),
      },
    });
  }

  // Marcadores
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !mapRef.current) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      points.forEach((p, index) => {
        const el = document.createElement("div");
        const color = PONTO_COLOR[p.tipo] ?? "#94a3b8";
        el.innerHTML = pinSvg(color, `${index + 1} ${PONTO_LABEL[p.tipo] ?? p.tipo}`);
        const marker = new maplibre.Marker({
          element: el,
          draggable: !readOnly,
          anchor: "bottom",
        })
          .setLngLat([p.lng, p.lat])
          .addTo(mapRef.current);
        if (!readOnly) {
          marker.on("dragend", () => {
            const pos = marker.getLngLat();
            const next = pointsRef.current.map((item) =>
              item.id === p.id
                ? { ...item, lat: pos.lat, lng: pos.lng, confirmed_at: new Date().toISOString() }
                : item,
            );
            emit(next);
          });
        }
        markersRef.current.push(marker);
      });
      syncLine();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, readOnly]);

  const addPointAtCenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const next: IntervencaoPonto[] = [
      ...points,
      {
        id: crypto.randomUUID(),
        tipo: newType,
        lat: c.lat,
        lng: c.lng,
        descricao: "",
        confirmed_at: new Date().toISOString(),
      },
    ];
    emit(next);
  };

  const removePoint = (id: string) => emit(points.filter((p) => p.id !== id));

  const updatePoint = (id: string, patch: Partial<IntervencaoPonto>) =>
    emit(points.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const centerOnGps = () => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 18 });
  };

  const extensao = routeLengthMeters(points);

  if (!apiKey && keyLoading) {
    return <div className="h-80 w-full animate-pulse rounded-xl border border-blue-500/30 bg-[#041126]" />;
  }

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-[#041126] p-3 text-sm text-amber-200">
        Mapa indisponível: configure <code>ARCGIS_WEB_API_KEY</code> no servidor para registrar a
        rota da intervenção.
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
        {userLocation && (
          <button
            type="button"
            onClick={centerOnGps}
            className="ml-auto rounded-md border border-cyan-500/50 bg-[#041126] px-3 py-1.5 text-xs font-semibold text-cyan-200"
          >
            <Crosshair className="mr-1 inline h-3.5 w-3.5" /> Centralizar no meu GPS
          </button>
        )}
      </div>

      <div ref={containerRef} className="h-80 w-full overflow-hidden rounded-xl border border-blue-500/40" />
      {error && <p className="text-xs text-rose-300">Erro no mapa: {error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          {points.length} ponto(s) · extensão da rota ≈ <strong className="text-cyan-300">{extensao} m</strong>
        </span>
        <span className="uppercase tracking-wider text-slate-500">{MAP_ATTRIBUTION_NOTE}</span>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/30 bg-[#041126] p-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as MapAtivoTipo)}
            className="rounded-md border border-cyan-500/35 bg-[#031027] px-2 py-1.5 text-xs text-slate-100"
          >
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {PONTO_LABEL[t] ?? t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addPointAtCenter}
            className="rounded-md border border-emerald-400/60 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" /> Adicionar no centro do mapa
          </button>
          <span className="text-[11px] text-slate-400">
            <MapPin className="mr-1 inline h-3.5 w-3.5 text-rose-400" />
            Depois arraste o pino até a posição exata no satélite.
          </span>
        </div>
      )}

      {points.length > 0 && (
        <ul className="space-y-2">
          {points.map((p, index) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/25 bg-[#031027] p-2"
            >
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: PONTO_COLOR[p.tipo] ?? "#94a3b8" }}
              >
                {index + 1} · {PONTO_LABEL[p.tipo] ?? p.tipo}
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
              </span>
              <input
                value={p.descricao}
                disabled={readOnly}
                onChange={(e) => updatePoint(p.id, { descricao: e.target.value })}
                placeholder="Descrição do ponto (ex.: poste 1042, emenda no vão)"
                className="min-w-[180px] flex-1 rounded-md border border-cyan-500/25 bg-[#020817] px-2 py-1 text-xs text-slate-100"
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removePoint(p.id)}
                  className="rounded-md border border-rose-500/40 px-2 py-1 text-rose-300"
                  aria-label="Remover ponto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
