import { signedFotoUrl } from "@/lib/checklists";
import { fotoCategoriaLabel, type FotoRow } from "@/lib/checklist-schema";

export interface ResolvedFoto {
  id: string;
  categoria: FotoRow["categoria"];
  label: string;
  legenda: string | null;
  uri: string;
}

async function toDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Ordena as evidências: antes → depois → demais. */
export function sortFotosAntesDepois(fotos: FotoRow[]): FotoRow[] {
  const weight = (c: FotoRow["categoria"]) => (c === "antes" ? 0 : c === "depois" ? 1 : 2);
  return [...fotos].sort(
    (a, b) => weight(a.categoria) - weight(b.categoria) || a.created_at.localeCompare(b.created_at),
  );
}

/** Converte as fotos em data URIs para embutir em PDFs (react-pdf não aceita URL assinada expirável). */
export async function resolveFotoDataUris(fotos: FotoRow[]): Promise<ResolvedFoto[]> {
  const ordered = sortFotosAntesDepois(fotos);
  const results = await Promise.all(
    ordered.map(async (f) => {
      try {
        const signed = await signedFotoUrl(f.storage_path);
        if (!signed) return null;
        const uri = await toDataUri(signed);
        return {
          id: f.id,
          categoria: f.categoria,
          label: fotoCategoriaLabel(f.categoria),
          legenda: f.legenda,
          uri,
        } satisfies ResolvedFoto;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is ResolvedFoto => r !== null);
}

/** Versão para exportação PNG: mantém URLs assinadas (sem custo de base64). */
export async function resolveFotoSignedUrls(fotos: FotoRow[]): Promise<ResolvedFoto[]> {
  const ordered = sortFotosAntesDepois(fotos);
  const results = await Promise.all(
    ordered.map(async (f) => {
      try {
        const uri = await signedFotoUrl(f.storage_path);
        if (!uri) return null;
        return {
          id: f.id,
          categoria: f.categoria,
          label: fotoCategoriaLabel(f.categoria),
          legenda: f.legenda,
          uri,
        } satisfies ResolvedFoto;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is ResolvedFoto => r !== null);
}
