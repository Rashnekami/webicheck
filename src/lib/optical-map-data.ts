// Monta a árvore completa de uma CEO (cabos, splitters, saídas) — usado
// tanto pela visualização em árvore quanto pelo PDF, pra garantir que os
// dois mostrem exatamente os mesmos dados.
import {
  getOpticalCeo,
  listOpticalCables,
  listOpticalSplitters,
  listOpticalSplitterOutputs,
} from "@/lib/optical-map.functions";

export interface OpticalOutputFull {
  id: string;
  porta_numero: number;
  cor: string;
  estado: string;
  potencia_saida_dbm: number | null;
  potencia_chegada_dbm: number | null;
  optical_ctos: { codigo: string; nome: string | null } | null;
}

export interface OpticalSplitterFull {
  id: string;
  codigo: string;
  tipo: string;
  num_saidas: number;
  fibra_alimentadora_id: string | null;
  potencia_entrada_dbm: number | null;
  perda_nominal_db: number | null;
  tolerancia_db: number | null;
  outputs: OpticalOutputFull[];
}

export interface OpticalCeoFullData {
  ceo: Awaited<ReturnType<typeof getOpticalCeo>>;
  cables: Awaited<ReturnType<typeof listOpticalCables>>;
  splitters: OpticalSplitterFull[];
}

export async function fetchCeoFullData(ceoId: string): Promise<OpticalCeoFullData> {
  const [ceo, cables, splitters] = await Promise.all([
    getOpticalCeo({ data: { ceoId } }),
    listOpticalCables({ data: { ceoId } }),
    listOpticalSplitters({ data: { ceoId } }),
  ]);

  const splittersFull: OpticalSplitterFull[] = await Promise.all(
    splitters.map(async (s: any) => {
      const outputs = await listOpticalSplitterOutputs({ data: { splitterId: s.id } });
      return { ...s, outputs };
    }),
  );

  return { ceo, cables, splitters: splittersFull };
}
