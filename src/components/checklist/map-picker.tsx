import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

type Point = { lat: number; lng: number };

type Props = {
  center: Point;
  userLocation?: Point | null;
  marker?: Point | null;
  disabled?: boolean;
  confirmed?: boolean;
  onConfirm: (lat: number, lng: number) => void;
};

/**
 * MapPicker satélite/híbrido baseado em Google Maps JS API,
 * com marcadores distintos para o GPS do técnico (círculo azul) e para
 * a CTO/NAP (pino vermelho, arrastável). A confirmação só é liberada
 * depois que o técnico move o pino ou clica em outra posição.
 * Fallback: coordenadas manuais quando a chave não estiver disponível.
 */
export function MapPicker({ center, userLocation, marker, disabled, confirmed, onConfirm }: Props) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  const [manual, setManual] = useState({
    lat: (marker ?? center).lat.toString(),
    lng: (marker ?? center).lng.toString(),
  });

  useEffect(() => {
    if (!key) return;
    // @ts-expect-error injected global
    if (window.google?.maps) {
      setReady(true);
      return;
    }
    (window as unknown as { initWebiMap?: () => void }).initWebiMap = () => setReady(true);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=initWebiMap${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    document.head.appendChild(s);
  }, [key, channel]);

  useEffect(() => {
    if (!ready || !ref.current || mapRef.current) return;
    const g = (window as any).google;
    const map = new g.maps.Map(ref.current, {
      center: userLocation ?? center,
      zoom: 20,
      mapTypeId: "hybrid",
      tilt: 0,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: true,
    });
    mapRef.current = map;
    if (userLocation) {
      new g.maps.Marker({
        position: userLocation,
        map,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#00c6ff",
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "Sua posição (GPS do técnico)",
        zIndex: 1,
      });
      new g.maps.Circle({
        map,
        center: userLocation,
        radius: 15,
        fillColor: "#00c6ff",
        fillOpacity: 0.08,
        strokeColor: "#00c6ff",
        strokeOpacity: 0.4,
        strokeWeight: 1,
      });
    }
    const initial = marker ?? center;
    markerRef.current = new g.maps.Marker({
      position: initial,
      map,
      draggable: !disabled,
      title: "CTO / NAP — arraste para a posição real",
      label: {
        text: "CTO",
        color: "#ffffff",
        fontSize: "11px",
        fontWeight: "700",
      },
      zIndex: 2,
    });
    if (!disabled) {
      markerRef.current.addListener("dragend", () => setMoved(true));
      map.addListener("click", (e: any) => {
        if (!e.latLng) return;
        markerRef.current?.setPosition(e.latLng);
        setMoved(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const confirm = () => {
    const pos = markerRef.current?.getPosition();
    if (pos) onConfirm(pos.lat(), pos.lng());
  };

  if (!key) {
    return (
      <div className="space-y-2 rounded-xl border border-blue-500/30 bg-[#041126] p-3 text-sm text-slate-300">
        <p>Insira as coordenadas manualmente (mapa indisponível).</p>
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
            if (Number.isFinite(lat) && Number.isFinite(lng)) onConfirm(lat, lng);
          }}
        >
          Confirmar posição
        </button>
      </div>
    );
  }

  const canConfirm = moved && !disabled;

  return (
    <div className="space-y-2">
      <div ref={ref} className="h-80 w-full overflow-hidden rounded-xl border border-blue-500/40" />
      {!disabled && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {confirmed
              ? "Posição confirmada. Arraste novamente e reconfirme se precisar corrigir."
              : moved
                ? "Pino movido. Toque em confirmar para registrar a posição da CTO."
                : "Arraste o pino vermelho para o poste da CTO ou toque no mapa. Sem confirmação, o remapeamento não pode ser finalizado."}
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
            {confirmed ? "Reconfirmar posição da CTO" : "Confirmar posição da CTO"}
          </button>
        </div>
      )}
    </div>
  );
}
