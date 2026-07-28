import { describe, expect, it } from "vitest";

import { drawMarker, projectToPixel, tileGridFor } from "@/lib/map-static";

describe("map-static", () => {
  it("cobre a imagem inteira com tiles", () => {
    const grid = tileGridFor({ lat: -24.3269, lng: -50.6156 }, 18, 1024, 640);
    expect(grid.tiles.length).toBeGreaterThan(0);
    // Todos os pixels devem estar cobertos por algum tile.
    const covered = grid.tiles.every((t) => t.dx > -256 && t.dy > -256);
    expect(covered).toBe(true);
    const maxX = Math.max(...grid.tiles.map((t) => t.dx + 256));
    const maxY = Math.max(...grid.tiles.map((t) => t.dy + 256));
    expect(maxX).toBeGreaterThanOrEqual(1024);
    expect(maxY).toBeGreaterThanOrEqual(640);
  });

  it("projeta o centro no meio da imagem", () => {
    const center = { lat: -24.3269, lng: -50.6156 };
    const p = projectToPixel(center, center, 18, 1024, 640);
    expect(p).toEqual({ x: 512, y: 320 });
  });

  it("projeta pontos a leste/norte nos quadrantes corretos", () => {
    const center = { lat: -24.3269, lng: -50.6156 };
    const p = projectToPixel({ lat: -24.3259, lng: -50.6146 }, center, 18, 1024, 640);
    expect(p.x).toBeGreaterThan(512); // leste
    expect(p.y).toBeLessThan(320); // norte
  });

  it("desenha marcador com contorno branco", () => {
    const w = 40;
    const h = 40;
    const buf = new Uint8Array(w * h * 4);
    drawMarker(buf, w, h, 20, 20, [225, 29, 72], 5);
    const center = (20 * w + 20) * 4;
    expect([buf[center], buf[center + 1], buf[center + 2]]).toEqual([225, 29, 72]);
    const ring = (20 * w + 26) * 4;
    expect(buf[ring]).toBe(255);
    expect(buf[ring + 3]).toBe(255);
  });
});
