// O pacote publica os .d.ts em dist/esm/types/src, mas aponta "types" para um
// caminho inexistente. Declaramos apenas o que o WebiCheck utiliza.
declare module "@esri/maplibre-arcgis" {
  export class BasemapStyle {
    static applyStyle(map: unknown, options: { style: string; token?: string }): BasemapStyle;
    updateStyle(options: { style?: string; token?: string }): Promise<unknown>;
  }
}
