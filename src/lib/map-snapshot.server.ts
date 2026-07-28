import UPNG from "upng-js";

import { blitRgba, drawMarker, projectToPixel, tileGridFor, TILE_SIZE } from "./map-static";

const STATIC_TILES_BASE =
  "https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1";

export class MapSnapshotNotConfiguredError extends Error {
  constructor() {
    super(
      "Snapshot cartográfico indisponível: configure a chave ARCGIS_STATIC_MAPS_API_KEY no servidor.",
    );
    this.name = "MapSnapshotNotConfiguredError";
  }
}

export interface SnapshotPoint {
  lat: number;
  lng: number;
  color?: [number, number, number];
  radius?: number;
}

export interface RenderSnapshotArgs {
  center: { lat: number; lng: number };
  zoom: number;
  /** enumeração ArcGIS, ex.: "arcgis/imagery" */
  style: string;
  width?: number;
  height?: number;
  points?: SnapshotPoint[];
}

export interface RenderedSnapshot {
  png: Uint8Array;
  sha256: string;
  width: number;
  height: number;
  zoom: number;
  style: string;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Renderiza um PNG do basemap ArcGIS no servidor, compondo tiles raster do
 * Static Basemap Tiles service. Nunca captura o DOM: a evidência é
 * reproduzível a partir de centro, zoom e estilo gravados no checklist.
 */
export async function renderStaticMapPng(args: RenderSnapshotArgs): Promise<RenderedSnapshot> {
  const token = process.env.ARCGIS_STATIC_MAPS_API_KEY;
  if (!token) throw new MapSnapshotNotConfiguredError();

  const width = args.width ?? 1024;
  const height = args.height ?? 640;
  const zoom = Math.max(1, Math.min(20, Math.round(args.zoom || 18)));
  const style = args.style && args.style.startsWith("arcgis/") ? args.style : "arcgis/imagery";

  const grid = tileGridFor(args.center, zoom, width, height);
  const canvas = new Uint8Array(width * height * 4);

  await Promise.all(
    grid.tiles.map(async (tile) => {
      const url = `${STATIC_TILES_BASE}/${style}/static/tile/${tile.z}/${tile.y}/${tile.x}?token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Falha ao obter tile ${tile.z}/${tile.x}/${tile.y} (${res.status}).`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const decoded = UPNG.decode(buf.buffer as ArrayBuffer);
      const rgba = new Uint8Array(UPNG.toRGBA8(decoded)[0]);
      blitRgba(canvas, width, height, rgba, decoded.width, decoded.height, tile.dx, tile.dy);
    }),
  );

  for (const point of args.points ?? []) {
    const p = projectToPixel(point, args.center, zoom, width, height);
    drawMarker(canvas, width, height, p.x, p.y, point.color ?? [225, 29, 72], point.radius ?? 9);
  }

  const png = new Uint8Array(
    UPNG.encode([canvas.buffer as ArrayBuffer], width, height, 0) as ArrayBuffer,
  );
  return { png, sha256: await sha256Hex(png), width, height, zoom, style };
}

export const SNAPSHOT_TILE_SIZE = TILE_SIZE;

export function isMapSnapshotConfigured(): boolean {
  return Boolean(process.env.ARCGIS_STATIC_MAPS_API_KEY);
}
