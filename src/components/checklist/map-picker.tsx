import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Crosshair, MapPin } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  BASEMAP_OPTIONS,
  DEFAULT_BASEMAP_MODE,
  MAP_ATTRIBUTION_NOTE,
  arcgisBrowserKey,
  basemapModeForStyle,
  basemapStyleFor,
  type BasemapMode,
} from "@/lib/map-basemaps";

type Point = { lat: number; lng: number };

export type MapConfirmMeta = {
  basemap_style: string;
  zoom: number;
};

type Props = {
  center: Point;
  userLocation?: (Point & { accuracy_m?: number | null }) | null;
  marker?: Point | null;
  disabled?: boolean;
  confirmed?: boolean;
  initialStyle?: string | null;
  ativoLabel?: string;
  onConfirm: (lat: number, lng: number, meta: MapConfirmMeta) => void;
};

/**
 * Seletor de localização do ativo (CTO/NAP) sobre MapLibre GL JS com basemaps
 * do ArcGIS Location Platform.
 *
 * Regras:
 * - O GPS representa o TÉCNICO e apenas centraliza a câmera.
 * - O ativo só é gravado após confirmação explícita do técnico.
 * - Reabrir um checklist confirmado nunca substitui a posição pelo GPS atual.
 */
export function MapPicker({
  center,
  userLocation,
  marker,
  disabled,
  confirmed,
  initialStyle,
  ativoLabel = "CTO",
  onConfirm,
}: Props) {
  const apiKey = arcgisBrowserKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const basemapRef = useRef<any>(null);
  const ativoMarkerRef = useRef<any>(null);
  const gpsMarkerRef = useRef<any>(null);
  const [mode, setMode] = useState<BasemapMode>(
    initialStyle ? basemapModeForStyle(initialStyle) : DEFAULT_BASEMAP_MODE,
  );
  const [moved, setMoved] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState({
    lat: (marker ?? center).lat.toString(),
    lng: (marker ?? center).lng.toString(),
  });

  const initialTarget = useMemo(
    () => marker ?? userLocation ?? center,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        const { BasemapStyle } = await import("@esri/maplibre-arcgis");
        if (cancelled || !containerRef.current) return;

        const map = new maplibre.Map({
          container: containerRef.current,
          center: [initialTarget.lng, initialTarget.lat],
          zoom: 18,
          maxZoom: 22,
          attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        // Attribution Esri/ArcGIS é obrigatória e é adicionada pelo BasemapStyle.
        basemapRef.current = BasemapStyle.applyStyle(map, {
          style: basemapStyleFor(mode),
          token: apiKey,
        });

        // Marcador do técnico (GPS): ícone circular com rótulo próprio.
        if (userLocation) {
          const gpsEl = document.createElement("div");
          gpsEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="width:18px;height:18px;border-radius:50%;background:#00c6ff;border:3px solid #fff;box-shadow:0 0 0 4px rgba(0,198,255,.25)"></div>
            <span style="margin-top:2px;font:700 10px/1 system-ui;color:#fff;text-shadow:0 1px 3px #000">TÉCNICO</span>
          </div>`;
          gpsMarkerRef.current = new maplibre.Marker({ element: gpsEl })
            .setLngLat([userLocation.lng, userLocation.lat])
            .addTo(map);
        }

        // Marcador do ativo: pino arrastável, ícone e rótulo diferentes do GPS.
        const ativoEl = document.createElement("div");
        ativoEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;cursor:grab">
          <span style="margin-bottom:2px;font:800 10px/1 system-ui;color:#fff;background:#e11d48;border-radius:4px;padding:2px 5px">${ativoLabel}</span>
          <svg width="26" height="34" viewBox="0 0 24 32"><path d="M12 0C5.9 0 1 4.9 1 11c0 8 11 21 11 21s11-13 11-21C23 4.9 18.1 0 12 0z" fill="#e11d48" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11" r="4" fill="#fff"/></svg>
        </div>`;
        const ativoMarker = new maplibre.Marker({
          element: ativoEl,
          draggable: !disabled,
          anchor: "bottom",
        })
          .setLngLat([initialTarget.lng, initialTarget.lat])
          .addTo(map);
        ativoMarkerRef.current = ativoMarker;

        if (!disabled) {
          ativoMarker.on("dragend", () => setMoved(true));
          map.on("click", (e: any) => {
            ativoMarker.setLngLat(e.lngLat);
            setMoved(true);
          });
        }
        map.on("load", () => setReady(true));
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

  // Troca de camada (mapa / satélite / híbrido) preservando os marcadores.
  useEffect(() => {
    if (!basemapRef.current) return;
    basemapRef.current.updateStyle({ style: basemapStyleFor(mode) });
  }, [mode]);

  const centerOnGps = () => {
    if (!userLocation || !mapRef.current) return;
    // Apenas movimenta a câmera — não altera o marcador do ativo.
    mapRef.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 19 });
  };

  const confirm = () => {
    const pos = ativoMarkerRef.current?.getLngLat?.();
    if (!pos) return;
    onConfirm(pos.lat, pos.lng, {
      basemap_style: basemapStyleFor(mode),
      zoom: Math.round((mapRef.current?.getZoom?.() ?? 18) * 100) / 100,
    });
    setMoved(false);
  };

  if (!apiKey) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-500/40 bg-[#041126] p-3 text-sm text-slate-300">
        <p className="text-amber-200">
          Mapa indisponível: configure <code>VITE_ARCGIS_API_KEY</code>. Informe as coordenadas
          manualmente enquanto isso.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded-md border border-cyan-500/35 bg-[#031027] px-2 py-1 font-mono text-slate-100"
            value={manual.lat}
            onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))}
            placeholder="lat"
          />
          <input
            className="rounded-md border border-cyan-500/35 bg-[#031027] px-2 py-1 font-mono text-slate-100"
            value={manual.lng}
            onChange={(e) => setManual((m) => ({ ...m, lng: e.target.value }))}
            placeholder="lng"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          className="rounded-md border border-cyan-400/40 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => {
            const lat = parseFloat(manual.lat);
            const lng = parseFloat(manual.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng))
              onConfirm(lat, lng, { basemap_style: "manual", zoom: 0 });
          }}
        >
          Confirmar localização da {ativoLabel}
        </button>
      </div>
    );
  }

  const canConfirm = !disabled && (moved || !confirmed);

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
        {userLocation && (
          <button
            type="button"
            onClick={centerOnGps}
            className="ml-auto rounded-md border border-cyan-500/50 bg-[#041126] px-3 py-1.5 text-xs font-semibold text-cyan-200"
          >
            <Crosshair className="mr-1 inline h-3.5 w-3.5" />
            Centralizar no meu GPS
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-80 w-full overflow-hidden rounded-xl border border-blue-500/40"
      />
      {error && <p className="text-xs text-rose-300">Erro no mapa: {error}</p>}
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {MAP_ATTRIBUTION_NOTE}
        {ready ? "" : " · carregando…"}
      </p>

      {!disabled && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            <MapPin className="mr-1 inline h-3.5 w-3.5 text-rose-400" />
            {confirmed && !moved
              ? "Posição confirmada. Arraste novamente e reconfirme se precisar corrigir."
              : "Aproxime pelo satélite, identifique o poste e arraste o pino sobre a " +
                ativoLabel +
                ". O GPS não define a posição do ativo."}
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className={
              canConfirm
                ? "rounded-md border border-emerald-400/60 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow"
                : "cursor-not-allowed rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-500"
            }
          >
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
            {confirmed ? `Reconfirmar localização da ${ativoLabel}` : `Confirmar localização da ${ativoLabel}`}
          </button>
        </div>
      )}
    </div>
  );
}
