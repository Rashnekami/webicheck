import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MapSnapshotInfo } from "@/lib/checklist-schema";

const BUCKET = "map-snapshots";

/**
 * Gera (ou reaproveita) o snapshot cartográfico do ativo confirmado no
 * checklist. A imagem é renderizada no backend a partir do basemap ArcGIS —
 * nunca a partir da tela do técnico.
 */
export const generateMapSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { checklistId: string; force?: boolean }) => {
    if (!input?.checklistId) throw new Error("checklistId obrigatório.");
    return input;
  })
  .handler(async ({ data, context }): Promise<MapSnapshotInfo> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("checklists")
      .select("id, provider_id, dados, revision_number")
      .eq("id", data.checklistId)
      .single();
    if (error || !row) throw new Error("Checklist não encontrado ou sem permissão.");

    const dados = (row.dados ?? {}) as Record<string, any>;
    const loc = (dados.localizacao ?? {}) as Record<string, any>;
    const ativo = loc.ativo ?? (loc.confirmada ? { ...loc.confirmada, tipo: "CTO" } : null);
    if (!ativo || typeof ativo.lat !== "number" || typeof ativo.lng !== "number") {
      throw new Error("Confirme a localização do ativo no mapa antes de gerar o snapshot.");
    }

    const style: string = loc.meta?.basemap_style?.startsWith?.("arcgis/")
      ? loc.meta.basemap_style
      : "arcgis/imagery";
    const zoom: number = Number(loc.meta?.zoom) || 18;
    const revision = row.revision_number ?? 1;

    const existing = loc.snapshot as MapSnapshotInfo | undefined;
    if (
      !data.force &&
      existing?.snapshot_path &&
      existing.center_lat === ativo.lat &&
      existing.center_lng === ativo.lng &&
      existing.style === style &&
      existing.revision_number === revision
    ) {
      return existing;
    }

    const { renderStaticMapPng } = await import("@/lib/map-snapshot.server");
    const points: Array<{ lat: number; lng: number; color?: [number, number, number] }> = [
      { lat: ativo.lat, lng: ativo.lng, color: [225, 29, 72] },
    ];
    if (loc.gps_original?.lat && loc.gps_original?.lng) {
      points.push({
        lat: loc.gps_original.lat,
        lng: loc.gps_original.lng,
        color: [0, 198, 255],
      });
    }

    const rendered = await renderStaticMapPng({
      center: { lat: ativo.lat, lng: ativo.lng },
      zoom,
      style,
      points,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${row.provider_id}/${row.id}/r${revision}-${rendered.sha256.slice(0, 12)}.png`;
    const upload = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, rendered.png, { contentType: "image/png", upsert: true });
    if (upload.error) throw new Error(`Falha ao salvar snapshot: ${upload.error.message}`);

    const info: MapSnapshotInfo = {
      snapshot_path: path,
      provider: "arcgis",
      style: rendered.style,
      center_lat: ativo.lat,
      center_lng: ativo.lng,
      zoom: rendered.zoom,
      width: rendered.width,
      height: rendered.height,
      generated_at: new Date().toISOString(),
      sha256: rendered.sha256,
      revision_number: revision,
    };

    const nextDados = {
      ...dados,
      localizacao: { ...loc, ativo, snapshot: info },
    };
    const { error: updateError } = await supabaseAdmin
      .from("checklists")
      .update({ dados: nextDados as unknown as Record<string, never> })
      .eq("id", row.id);
    if (updateError) throw new Error(`Falha ao gravar snapshot no checklist: ${updateError.message}`);

    void userId;
    return info;
  });

/** URL assinada temporária para exibir o snapshot no app e no PDF. */
export const getMapSnapshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => {
    if (!input?.path) throw new Error("path obrigatório.");
    return input;
  })
  .handler(async ({ data, context }): Promise<string | null> => {
    const providerId = data.path.split("/")[0];
    const { data: allowed } = await context.supabase
      .from("checklists")
      .select("id")
      .eq("provider_id", providerId)
      .limit(1);
    if (!allowed || allowed.length === 0) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(data.path, 3600);
    return signed.data?.signedUrl ?? null;
  });

/** Indica ao frontend se a chave de snapshot está configurada no servidor. */
export const mapSnapshotStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env.ARCGIS_STATIC_MAPS_API_KEY),
}));
