import jpeg from "jpeg-js";
import UPNG from "upng-js";

import { blitRgba, drawMarker, projectToPixel, tileGridFor, TILE_SIZE } from "./map-static";

const STATIC_TILES_BASE =
  "https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1";
/** Serviço raster de imagem aérea (satélite) do ArcGIS. */
const IMAGERY_TILES_BASE =
  "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile";

function isImageryStyle(style: string): boolean {
  return style.startsWith("arcgis/imagery");
}

/** Decodifica PNG (tiles vetorizados) ou JPEG (satélite) para RGBA. */
function decodeTile(bytes: Uint8Array): { rgba: Uint8Array; width: number; height: number } {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isJpeg) {
    const img = jpeg.decode(bytes, { useTArray: true });
    return { rgba: new Uint8Array(img.data), width: img.width, height: img.height };
  }
  const decoded = UPNG.decode(bytes.buffer as ArrayBuffer);
  return {
    rgba: new Uint8Array(UPNG.toRGBA8(decoded)[0]),
    width: decoded.width,
    height: decoded.height,
  };
}

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

  const imagery = isImageryStyle(style);

  await Promise.all(
    grid.tiles.map(async (tile) => {
      // Satélite: serviço raster World_Imagery (exige token em query string).
      // Demais estilos: static basemap tiles com Authorization Bearer, sem
      // token na URL. Em nenhum caso o token é registrado em log ou erro.
      const url = imagery
        ? `${IMAGERY_TILES_BASE}/${tile.z}/${tile.y}/${tile.x}?token=${encodeURIComponent(token)}`
        : `${STATIC_TILES_BASE}/${style}/static/tile/${tile.z}/${tile.y}/${tile.x}`;
      const res = await fetch(
        url,
        imagery ? undefined : { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`Falha ao obter tile ${tile.z}/${tile.x}/${tile.y} (${res.status}).`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const decoded = decodeTile(buf);
      blitRgba(canvas, width, height, decoded.rgba, decoded.width, decoded.height, tile.dx, tile.dy);
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
