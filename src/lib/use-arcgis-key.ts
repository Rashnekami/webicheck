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
        cached = res?.key ?? null;
        return cached;
      })
      .catch(() => {
        cached = null;
        return null;
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
