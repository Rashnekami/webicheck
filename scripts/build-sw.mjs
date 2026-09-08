// Gera o service worker DEPOIS do build de hospedagem (.output/public).
// O vite-plugin-pwa rodava no fim do build de cliente (dist/), que não é o
// artefato publicado — resultado: sw.js fora do lugar e precache vazio.
import { generateSW } from "workbox-build";
import { existsSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve(".output/public");
if (!existsSync(outDir)) {
  console.warn("[pwa] .output/public não existe — service worker não gerado.");
  process.exit(0);
}

const { count, size, warnings } = await generateSW({
  globDirectory: outDir,
  swDest: path.join(outDir, "sw.js"),
  // Precache enxuto: shell + ícones. Bibliotecas pesadas de exportação
  // (PDF, mapas, planilhas) ficam sob demanda com cache em runtime.
  globPatterns: ["**/*.{css,html,ico,webmanifest}", "assets/*.js", "icon-*.png", "apple-touch-icon.png"],
  globIgnores: [
    "**/node_modules/**",
    "**/*pdf*.js",
    "**/*maplibre*.js",
    "**/*html2canvas*.js",
    "**/*xlsx*.js",
    "**/*jszip*.js",
    "**/*pptx*.js",
    "**/*recharts*.js",
  ],
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  navigateFallback: "/painel",
  navigateFallbackDenylist: [/^\/api\//, /^\/~oauth/, /^\/validar\//, /^\/sw\.js$/],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "webifibra-pages",
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    {
      urlPattern: ({ url, request }) =>
        url.origin === self.location.origin &&
        (request.destination === "script" ||
          request.destination === "style" ||
          request.destination === "font"),
      handler: "CacheFirst",
      options: {
        cacheName: "webifibra-assets",
        expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "webifibra-images",
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
  ],
});

for (const warning of warnings) console.warn("[pwa]", warning);
console.log(`[pwa] sw.js gerado em .output/public — ${count} arquivos, ${(size / 1024).toFixed(0)} kB.`);
