import { createServerFn } from "@tanstack/react-start";

/**
 * Devolve exclusivamente a chave pública de aplicação web do ArcGIS
 * (credencial "WebiCheck - Mapas Base", restrita por referrer, apenas
 * Basemap Styles).
 *
 * Nunca retorna ARCGIS_STATIC_MAPS_API_KEY nem qualquer outro secret do
 * projeto: a chave de snapshot permanece exclusivamente server-side.
 */
export const arcgisWebKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.ARCGIS_WEB_API_KEY;
  return { key: key && key.trim() ? key.trim() : null };
});
