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

export function basemapModeForStyle(style: string | null | undefined): BasemapMode {
  return BASEMAP_OPTIONS.find((o) => o.style === style)?.mode ?? DEFAULT_BASEMAP_MODE;
}

export function arcgisBrowserKey(): string | undefined {
  const key = import.meta.env.VITE_ARCGIS_API_KEY as string | undefined;
  return key && key.trim() ? key.trim() : undefined;
}

export const MAP_ATTRIBUTION_NOTE = "Fonte cartográfica: ArcGIS / Esri";
