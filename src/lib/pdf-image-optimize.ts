/**
 * Redução de resolução das evidências APENAS para embutir no PDF.
 * As imagens originais no storage não são alteradas.
 *
 * Sem dependência nova: usa canvas do próprio navegador. Em ambiente sem DOM
 * (teste/SSR) devolve o data URI original.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.8;

function hasDom(): boolean {
  return typeof document !== "undefined" && typeof Image !== "undefined";
}

async function loadImage(uri: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = uri;
  });
}

/** Reduz um data URI para no máximo `maxSide` px no maior lado, em JPEG. */
export async function optimizeImageDataUri(
  uri: string,
  maxSide = MAX_SIDE,
  quality = QUALITY,
): Promise<string> {
  if (!uri || !hasDom() || uri.startsWith("data:image/svg")) return uri;
  try {
    const img = await loadImage(uri);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return uri;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    // Já pequena e já JPEG: nada a ganhar.
    if (scale === 1 && uri.startsWith("data:image/jpeg")) return uri;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return uri;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", quality);
    return out.length < uri.length ? out : uri;
  } catch {
    return uri;
  }
}

export async function optimizeImageDataUris<T extends { uri: string }>(
  items: T[],
  maxSide = MAX_SIDE,
  quality = QUALITY,
): Promise<T[]> {
  return await Promise.all(
    items.map(async (item) => ({ ...item, uri: await optimizeImageDataUri(item.uri, maxSide, quality) })),
  );
}
