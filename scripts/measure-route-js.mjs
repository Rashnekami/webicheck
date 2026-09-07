// Run after a clean build: node scripts/measure-route-js.mjs
// es-module-lexer is already installed with the Vite toolchain.
import { init, parse } from "es-module-lexer";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

await init;
const directory = path.resolve(".output/public/assets");
const files = readdirSync(directory);
const routes = [
  "checklists._id-",
  "dashboard-",
  "painel-",
  "trocas-ont-",
  "avaliacoes._id-",
  "canal-etico._id-",
];

function staticDependencies(file, visited = new Set()) {
  if (visited.has(file) || !existsSync(file)) return visited;
  visited.add(file);
  for (const dependency of parse(readFileSync(file, "utf8"))[0]) {
    if (dependency.d === -1 && dependency.n?.startsWith(".")) {
      staticDependencies(path.resolve(path.dirname(file), dependency.n), visited);
    }
  }
  return visited;
}

const result = {};
for (const route of routes) {
  const matches = files.filter((file) => file.startsWith(route) && file.endsWith(".js"));
  if (matches.length !== 1)
    throw new Error(`Expected one chunk for ${route}; run a clean build first.`);
  const dependencies = [...staticDependencies(path.join(directory, matches[0]))];
  result[route] = {
    files: dependencies.length,
    rawBytes: dependencies.reduce((sum, file) => sum + statSync(file).size, 0),
    gzipBytes: dependencies.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0),
    pdf: dependencies.filter((file) => /pdf/i.test(file)).map((file) => path.basename(file)),
  };
}
console.log(JSON.stringify(result, null, 2));
