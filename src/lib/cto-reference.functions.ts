import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCtoNome } from "@/lib/cto-remap.functions";
import { normalizeCity } from "@/lib/dashboard-analytics";

async function requireProviderWriter(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("provider_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.provider_id) throw new Error("Perfil sem provedor associado.");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: isSupervisor } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "supervisor",
  });
  if (!isAdmin && !isSupervisor) throw new Error("Somente administradores/supervisores podem importar CTOs.");
  return profile.provider_id as string;
}

// Guarda a planilha importada como um novo snapshot histórico — nunca
// sobrescreve o anterior, só passa a ser o "vigente" por ser o mais recente
// (ver view cto_reference_latest).
export const importCtoReferenceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      cidade: string;
      filename: string | null;
      pontos: { nome: string; lat: number | null; lng: number | null }[];
    }) => {
      if (!data.cidade?.trim()) throw new Error("Cidade obrigatória.");
      if (!Array.isArray(data.pontos) || data.pontos.length === 0)
        throw new Error("Nenhuma CTO na planilha.");
      if (data.pontos.length > 5000) throw new Error("Máximo de 5000 CTOs por importação.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cidade = normalizeCity(data.cidade);

    const { data: snapshot, error: snapErr } = await supabaseAdmin
      .from("cto_reference_snapshots")
      .insert({
        provider_id: providerId,
        cidade,
        filename: data.filename,
        imported_by: context.userId,
        total_ctos: data.pontos.length,
      })
      .select("id, created_at")
      .single();
    if (snapErr) throw new Error(snapErr.message);

    const rows = data.pontos.map((p) => ({
      snapshot_id: snapshot.id,
      provider_id: providerId,
      cidade,
      nome: p.nome,
      nome_normalizado: normalizeCtoNome(p.nome),
      lat: p.lat,
      lng: p.lng,
    }));

    // Insere em lotes pra não estourar limite de payload numa importação grande.
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabaseAdmin.from("cto_reference_points").insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
    }

    return { snapshotId: snapshot.id, createdAt: snapshot.created_at, total: rows.length };
  });

export const listCtoCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.provider_id && !profile?.platform_admin)
      throw new Error("Perfil sem provedor associado.");

    let latestQ = supabaseAdmin
      .from("cto_reference_latest")
      .select("snapshot_id, cidade, total_ctos, created_at");
    if (profile.provider_id) latestQ = latestQ.eq("provider_id", profile.provider_id);
    const { data: latest, error: latestErr } = await latestQ;
    if (latestErr) throw new Error(latestErr.message);

    let remapQ = supabaseAdmin
      .from("checklists")
      .select("cidade, dados")
      .eq("tipo", "remapeamento_cto")
      .eq("status", "finalizado")
      .eq("is_current", true);
    if (profile.provider_id) remapQ = remapQ.eq("provider_id", profile.provider_id);
    const { data: remapRows, error: remapErr } = await remapQ;
    if (remapErr) throw new Error(remapErr.message);

    const remapByCidade = new Map<string, Set<string>>();
    for (const row of remapRows ?? []) {
      const dados = row.dados as { identificacao?: { cto_codigo?: string } } | null;
      const codigo = dados?.identificacao?.cto_codigo?.trim();
      if (!codigo) continue;
      const cidade = normalizeCity(row.cidade) || "(sem cidade)";
      const set = remapByCidade.get(cidade) ?? new Set<string>();
      set.add(normalizeCtoNome(codigo));
      remapByCidade.set(cidade, set);
    }

    return (latest ?? []).map((snap) => {
      const cidadeSnap = snap.cidade ?? "";
      const remapedas = remapByCidade.get(cidadeSnap)?.size ?? 0;
      const total = snap.total_ctos ?? 0;
      return {
        cidade: cidadeSnap,
        total,
        remapeadas: Math.min(remapedas, total),
        percentual: total > 0 ? Math.round((Math.min(remapedas, total) / total) * 1000) / 10 : 0,
        snapshotEm: snap.created_at,
      };
    });
  });

// Busca o ponto de referência (OZmap) mais recente pra uma CTO específica,
// usado no formulário de remapeamento pra plotar a posição "oficial" no
// mapa ao lado da posição confirmada pelo técnico em campo.
export const getCtoReferencePoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cidade: string; nome: string }) => {
    if (!data.cidade?.trim() || !data.nome?.trim()) throw new Error("Cidade e nome obrigatórios.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("provider_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.provider_id) return null;

    const { data: latestSnap } = await supabaseAdmin
      .from("cto_reference_latest")
      .select("snapshot_id")
      .eq("provider_id", profile.provider_id)
      .eq("cidade", normalizeCity(data.cidade))
      .maybeSingle();
    if (!latestSnap) return null;

    const key = normalizeCtoNome(data.nome);
    const { data: point } = await supabaseAdmin
      .from("cto_reference_points")
      .select("lat, lng")
      .eq("snapshot_id", latestSnap.snapshot_id ?? "")
      .eq("nome_normalizado", key)
      .maybeSingle();

    if (!point || point.lat == null || point.lng == null) return null;
    return { lat: point.lat as number, lng: point.lng as number };
  });

/** Todos os pontos de referência (planilha OZmap) do provedor, já marcados
 * como remapeados ou pendentes, pra desenhar a camada de cobertura no mapa
 * de Remapeamentos. */
export const listCtoReferencePoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.provider_id && !profile?.platform_admin) return [];

    let latestQ = supabaseAdmin.from("cto_reference_latest").select("snapshot_id, cidade");
    if (profile.provider_id) latestQ = latestQ.eq("provider_id", profile.provider_id);
    const { data: latest, error: latestErr } = await latestQ;
    if (latestErr) throw new Error(latestErr.message);
    const snapshotIds = (latest ?? [])
      .map((s) => s.snapshot_id as string | null)
      .filter((id): id is string => !!id);
    if (snapshotIds.length === 0) return [];

    // PostgREST limita a resposta a 1000 linhas, então paginamos por range —
    // sem isso o mapa mostrava só as primeiras 1000 caixas.
    type RefRow = { id: string; cidade: string | null; nome: string | null; nome_normalizado: string; lat: number; lng: number };
    const points: RefRow[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
      const { data: page, error: pointsErr } = await supabaseAdmin
        .from("cto_reference_points")
        .select("id, cidade, nome, nome_normalizado, lat, lng")
        .in("snapshot_id", snapshotIds)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pointsErr) throw new Error(pointsErr.message);
      points.push(...((page ?? []) as RefRow[]));
      if (!page || page.length < PAGE) break;
    }


    let remapQ = supabaseAdmin
      .from("checklists")
      .select("cidade, dados")
      .eq("tipo", "remapeamento_cto")
      .eq("status", "finalizado")
      .eq("is_current", true);
    if (profile.provider_id) remapQ = remapQ.eq("provider_id", profile.provider_id);
    const { data: remapRows } = await remapQ;

    const remapKeys = new Set<string>();
    for (const row of remapRows ?? []) {
      const dados = row.dados as { identificacao?: { cto_codigo?: string } } | null;
      const codigo = dados?.identificacao?.cto_codigo?.trim();
      if (!codigo) continue;
      remapKeys.add(`${normalizeCity(row.cidade ?? "")}|${normalizeCtoNome(codigo)}`);
    }

    return (points ?? []).map((p) => ({
      id: p.id as string,
      cidade: (p.cidade as string) ?? "",
      nome: (p.nome as string) ?? "",
      lat: p.lat as number,
      lng: p.lng as number,
      remapeado: remapKeys.has(`${normalizeCity((p.cidade as string) ?? "")}|${p.nome_normalizado as string}`),
    }));
  });
