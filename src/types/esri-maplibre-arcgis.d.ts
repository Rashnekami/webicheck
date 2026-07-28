// O pacote publica os .d.ts em dist/esm/types/src, mas aponta "types" para um
// caminho inexistente. Reexportamos as declarações reais.
declare module "@esri/maplibre-arcgis" {
  export * from "@esri/maplibre-arcgis/dist/esm/types/src/MaplibreArcGIS";
}
