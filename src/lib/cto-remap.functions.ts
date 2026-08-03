import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Normaliza nome de CTO pra comparar Excel x sistema: maiúsculas, sem
// acentos, sem espaços/pontuação nas bordas. O importador de CTOs usa
// nomes como "D01A13-TIBAGI" e o técnico digita o mesmo código em
// identificacao.cto_codigo no formulário de remapeamento.
export function normalizeCtoNome(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export interface CtoRemapStatus {
  remapeado: boolean;
  checklistCode: string | null;
  finalizadoEm: string | null;
  novaLat: number | null;
  novaLng: number | null;
}

export const matchCtoRemapStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { nomes: string[] }) => {
    if (!Array.isArray(data.nomes) || data.nomes.length === 0)
      throw new Error("Lista de CTOs vazia.");
    if (data.nomes.length > 2000) throw new Error("Máximo de 2000 CTOs por vez.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.provider_id && !profile?.platform_admin)
      throw new Error("Perfil sem provedor associado.");

    let q = supabaseAdmin
      .from("checklists")
      .select("numero_publico, finalizado_em, dados")
      .eq("tipo", "remapeamento_cto")
      .eq("status", "finalizado")
      .eq("is_current", true);
    if (profile.provider_id) q = q.eq("provider_id", profile.provider_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const byName = new Map<
      string,
      { checklistCode: string | null; finalizadoEm: string | null; lat: number | null; lng: number | null }
    >();

    for (const row of rows ?? []) {
      const dados = row.dados as {
        identificacao?: { cto_codigo?: string };
        localizacao?: {
          ativo?: { lat?: number; lng?: number } | null;
          confirmada?: { lat?: number; lng?: number } | null;
        };
      } | null;
      const codigo = dados?.identificacao?.cto_codigo?.trim();
      if (!codigo) continue;
      const key = normalizeCtoNome(codigo);
      const ativo = dados?.localizacao?.ativo ?? dados?.localizacao?.confirmada ?? null;
      const existing = byName.get(key);
      // Se houver mais de um remapeamento pro mesmo código, fica com o mais recente.
      if (!existing || (row.finalizado_em ?? "") > (existing.finalizadoEm ?? "")) {
        byName.set(key, {
          checklistCode: row.numero_publico ?? null,
          finalizadoEm: row.finalizado_em ?? null,
          lat: ativo?.lat ?? null,
          lng: ativo?.lng ?? null,
        });
      }
    }

    const result: Record<string, CtoRemapStatus> = {};
    for (const nome of data.nomes) {
      const key = normalizeCtoNome(nome);
      const match = byName.get(key);
      result[nome] = match
        ? {
            remapeado: true,
            checklistCode: match.checklistCode,
            finalizadoEm: match.finalizadoEm,
            novaLat: match.lat,
            novaLng: match.lng,
          }
        : { remapeado: false, checklistCode: null, finalizadoEm: null, novaLat: null, novaLng: null };
    }
    return result;
  });
