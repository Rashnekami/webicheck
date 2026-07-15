import { toPng } from "html-to-image";

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 5000);
        }),
    ),
  );
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
}

export async function exportNodeAsPng(
  node: HTMLElement,
  filename: string,
): Promise<Blob> {
  await waitForImages(node);
  // pixelRatio 2 para nitidez em telas móveis
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
    style: { transform: "none" },
  });
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return blob;
}

export function buildImageFilename(opts: {
  os?: string | null;
  numero?: string | null;
}): string {
  const safe = (s?: string | null) =>
    (s ?? "").toString().trim().replace(/[^\w-]+/g, "-").slice(0, 40);
  const os = safe(opts.os);
  const num = safe(opts.numero);
  if (os) return `checklist-webifibra-OS-${os}.png`;
  if (num) return `checklist-webifibra-${num}.png`;
  return `checklist-webifibra.png`;
}
