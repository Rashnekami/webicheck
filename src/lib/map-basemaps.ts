// Camada cartográfica do WebiCheck: MapLibre GL JS (motor) + ArcGIS Location
// Platform (provedor). Nenhuma dependência Mapbox.
//
// A chave de aplicação web vem exclusivamente da configuração de ambiente do
// frontend (VITE_ARCGIS_API_KEY) e é restrita por referrers no ArcGIS.

export type BasemapMode = "mapa" | "satelite" | "hibrido";

export interface BasemapOption {
  mode: BasemapMode;
  label: string;
  /** Enumeração de estilo do ArcGIS Basemap Styles Service. */
  style: string;
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  { mode: "mapa", label: "Mapa", style: "arcgis/streets" },
  { mode: "satelite", label: "Satélite", style: "arcgis/imagery/standard" },
  { mode: "hibrido", label: "Híbrido", style: "arcgis/imagery" },
];

export const DEFAULT_BASEMAP_MODE: BasemapMode = "hibrido";

export function basemapStyleFor(mode: BasemapMode): string {
  return (BASEMAP_OPTIONS.find((o) => o.mode === mode) ?? BASEMAP_OPTIONS[2]).style;
}

const ESRI_TILES = {
  imagery:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  streets:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  labels:
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
};

function rasterSource(url: string) {
  return {
    type: "raster" as const,
    tiles: [url],
    tileSize: 256,
    maxzoom: 19,
    attribution: MAP_ATTRIBUTION_NOTE,
  };
}

/**
 * Estilo MapLibre gerado localmente a partir dos serviços raster públicos da
 * Esri (ArcGIS Online). Não depende de token: o Basemap Styles v2 exigia uma
 * chave restrita por referrer que retornava 401 no preview/domínios próprios,
 * deixando o mapa totalmente escuro.
 */
export function basemapStyleUrl(style: string, _token?: string | null): any {
  const satelite = style.includes("imagery");
  const hibrido = style === "arcgis/imagery";
  const sources: Record<string, unknown> = {
    base: rasterSource(satelite ? ESRI_TILES.imagery : ESRI_TILES.streets),
  };
  const layers: Array<Record<string, unknown>> = [
    { id: "base", type: "raster", source: "base" },
  ];
  if (hibrido) {
    sources.labels = rasterSource(ESRI_TILES.labels);
    layers.push({ id: "labels", type: "raster", source: "labels" });
  }
  return { version: 8, sources, layers };
}


export function basemapModeForStyle(style: string | null | undefined): BasemapMode {
  return BASEMAP_OPTIONS.find((o) => o.style === style)?.mode ?? DEFAULT_BASEMAP_MODE;
}

export function arcgisBrowserKey(): string | undefined {
  const key = import.meta.env.VITE_ARCGIS_API_KEY as string | undefined;
  return key && key.trim() ? key.trim() : undefined;
}

export const MAP_ATTRIBUTION_NOTE = "Fonte cartográfica: ArcGIS / Esri";
