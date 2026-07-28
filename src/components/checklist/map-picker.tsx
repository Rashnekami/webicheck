import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };

type Props = {
  center: Point;
  userLocation?: Point | null;
  marker?: Point | null;
  disabled?: boolean;
  onConfirm: (lat: number, lng: number) => void;
};

/**
 * MapPicker satélite/híbrido baseado em Google Maps JS API,
 * carregado via chave pública do connector Google Maps.
 * Fallback: coordenadas manuais quando a chave não estiver disponível.
 */
export function MapPicker({ center, userLocation, marker, disabled, onConfirm }: Props) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
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
    const map = new (window as any).google.maps.Map(ref.current, {
      center,
      zoom: 19,
      mapTypeId: "hybrid",
      tilt: 0,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;
    if (userLocation) {
      new (window as any).google.maps.Marker({
        position: userLocation,
        map,
        icon: {
          path: (window as any).google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#00c6ff",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        title: "Sua posição",
      });
    }
    const initial = marker ?? center;
    markerRef.current = new (window as any).google.maps.Marker({
      position: initial,
      map,
      draggable: !disabled,
      title: "CTO / NAP",
    });
    if (!disabled) {
      map.addListener("click", (e: any) => {
        if (!e.latLng) return;
        markerRef.current?.setPosition(e.latLng);
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

  return (
    <div className="space-y-2">
      <div ref={ref} className="h-72 w-full overflow-hidden rounded-xl border border-blue-500/40" />
      {!disabled && (
        <button
          type="button"
          onClick={confirm}
          className="rounded-md border border-cyan-400/50 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow"
        >
          Confirmar posição do marcador
        </button>
      )}
    </div>
  );
}
