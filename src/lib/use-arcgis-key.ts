import { useEffect, useState } from "react";

import { arcgisWebKey } from "@/lib/map-basemaps.functions";
import { arcgisBrowserKey } from "@/lib/map-basemaps";

/**
 * Cache em memória (uma única chamada por sessão de navegador) da chave
 * pública de basemaps do ArcGIS. A chave nunca é persistida em storage,
 * log ou banco.
 */
let cached: string | null | undefined;
let inflight: Promise<string | null> | null = null;

/**
 * Os basemaps agora usam serviços raster públicos da Esri, que não exigem
 * token. Mantemos este hook (e o valor sentinela) para não quebrar os
 * componentes que aguardavam a chave antes de montar o mapa.
 */
const PUBLIC_SENTINEL = "public";

function loadKey(): Promise<string | null> {
  const envKey = arcgisBrowserKey();
  if (envKey) {
    cached = envKey;
    return Promise.resolve(envKey);
  }
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight) {
    inflight = arcgisWebKey()
      .then((res) => {
        cached = res?.key ?? PUBLIC_SENTINEL;
        return cached;
      })
      .catch(() => {
        cached = PUBLIC_SENTINEL;
        return cached;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}


export function useArcgisBrowserKey(): { key: string | null; loading: boolean } {
  const [key, setKey] = useState<string | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    let active = true;
    if (cached !== undefined) {
      setKey(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadKey().then((value) => {
      if (!active) return;
      setKey(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { key, loading };
}
