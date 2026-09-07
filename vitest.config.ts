import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests do not need the Lovable, Cloudflare or service-worker plugins.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
