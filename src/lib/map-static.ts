// Matemática de tiles Web Mercator e composição do mosaico do snapshot.
// Módulo puro (sem rede, sem DOM) para permitir testes unitários.

export const TILE_SIZE = 256;

export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export interface TileRef {
  z: number;
  x: number;
  y: number;
  /** posição do canto superior esquerdo do tile dentro da imagem final */
  dx: number;
  dy: number;
}

export interface TileGrid {
  tiles: TileRef[];
  width: number;
  height: number;
  /** posição em pixels do centro solicitado dentro da imagem final */
  centerPx: { x: number; y: number };
}

/** Calcula quais tiles cobrem uma imagem width x height centrada em (lat,lng). */
export function tileGridFor(
  center: { lat: number; lng: number },
  zoom: number,
  width: number,
  height: number,
): TileGrid {
  const z = Math.max(0, Math.min(22, Math.round(zoom)));
  const cx = lonToTileX(center.lng, z) * TILE_SIZE;
  const cy = latToTileY(center.lat, z) * TILE_SIZE;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const firstX = Math.floor(left / TILE_SIZE);
  const firstY = Math.floor(top / TILE_SIZE);
  const lastX = Math.floor((left + width - 1) / TILE_SIZE);
  const lastY = Math.floor((top + height - 1) / TILE_SIZE);
  const max = Math.pow(2, z);
  const tiles: TileRef[] = [];
  for (let ty = firstY; ty <= lastY; ty++) {
    for (let tx = firstX; tx <= lastX; tx++) {
      if (ty < 0 || ty >= max) continue;
      tiles.push({
        z,
        x: ((tx % max) + max) % max,
        y: ty,
        dx: tx * TILE_SIZE - left,
        dy: ty * TILE_SIZE - top,
      });
    }
  }
  return { tiles, width, height, centerPx: { x: width / 2, y: height / 2 } };
}

/** Converte lat/lng em pixel dentro da imagem gerada. */
export function projectToPixel(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const z = Math.max(0, Math.min(22, Math.round(zoom)));
  const px = lonToTileX(point.lng, z) * TILE_SIZE;
  const py = latToTileY(point.lat, z) * TILE_SIZE;
  const cx = lonToTileX(center.lng, z) * TILE_SIZE;
  const cy = latToTileY(center.lat, z) * TILE_SIZE;
  return { x: Math.round(px - cx + width / 2), y: Math.round(py - cy + height / 2) };
}

export function blitRgba(
  dest: Uint8Array,
  destW: number,
  destH: number,
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dxRaw: number,
  dyRaw: number,
) {
  // dx/dy chegam fracionários (o centro raramente cai na borda de um tile).
  // Índices fracionários em TypedArray são descartados silenciosamente, o que
  // deixava o mosaico todo preto — por isso arredondamos aqui.
  const dx = Math.round(dxRaw);
  const dy = Math.round(dyRaw);
  for (let y = 0; y < srcH; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= destH) continue;
    for (let x = 0; x < srcW; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= destW) continue;
      const s = (y * srcW + x) * 4;
      const d = (ty * destW + tx) * 4;
      dest[d] = src[s];
      dest[d + 1] = src[s + 1];
      dest[d + 2] = src[s + 2];
      dest[d + 3] = 255;
    }
  }
}

export function drawMarker(
  buf: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  color: [number, number, number],
  radius = 9,
) {
  for (let dy = -radius - 2; dy <= radius + 2; dy++) {
    for (let dx = -radius - 2; dx <= radius + 2; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (py * w + px) * 4;
      if (dist <= radius) {
        buf[i] = color[0];
        buf[i + 1] = color[1];
        buf[i + 2] = color[2];
        buf[i + 3] = 255;
      } else if (dist <= radius + 2) {
        buf[i] = 255;
        buf[i + 1] = 255;
        buf[i + 2] = 255;
        buf[i + 3] = 255;
      }
    }
  }
}
