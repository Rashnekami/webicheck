import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateFibersFromConstrucao, generateFibersUniform, colorForIndex, outputsForSplitterType } from "@/lib/optical-map";

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
  if (!isAdmin && !isSupervisor) throw new Error("Somente administradores/supervisores.");
  return profile.provider_id as string;
}

async function requireProviderId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("provider_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.provider_id) throw new Error("Perfil sem provedor associado.");
  return profile.provider_id as string;
}

// ---------- CEO ----------

export const listOpticalCeos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("optical_ceos")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createOpticalCeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    codigo: string;
    nome?: string;
    cidade?: string;
    bairro?: string;
    endereco?: string;
    lat?: number | null;
    lng?: number | null;
    modelo?: string;
    fabricante?: string;
    quantidade_bandejas?: number | null;
    observacoes?: string;
  }) => {
    if (!data.codigo?.trim()) throw new Error("Código da CEO obrigatório.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("optical_ceos")
      .insert({ ...data, provider_id: providerId, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getOpticalCeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ceoId: string }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("optical_ceos")
      .select("*")
      .eq("id", data.ceoId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("CEO não encontrada.");
    return row;
  });

// ---------- Cabos + fibras (geração automática) ----------

export const createOpticalCable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    ceoId?: string | null;
    codigo: string;
    capacidade: number;
    tubos: number;
    fibrasPorTubo: number;
    construcao?: { tubo: number; fibras: number }[] | null;
    tipo?: string;
    direcao?: string;
    origem?: string;
    destino?: string;
    fabricante?: string;
    modelo?: string;
    metragem?: number | null;
    etiqueta?: string;
    observacoes?: string;
  }) => {
    if (!data.codigo?.trim()) throw new Error("Código do cabo obrigatório.");
    if (!data.capacidade || data.capacidade < 1) throw new Error("Capacidade inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cable, error } = await supabaseAdmin
      .from("optical_cables")
      .insert({
        provider_id: providerId,
        ceo_id: data.ceoId ?? null,
        codigo: data.codigo,
        capacidade: data.capacidade,
        tubos: data.tubos,
        fibras_por_tubo: data.fibrasPorTubo,
        construcao: data.construcao ?? null,
        tipo: data.tipo ?? null,
        direcao: data.direcao ?? null,
        origem: data.origem ?? null,
        destino: data.destino ?? null,
        fabricante: data.fabricante ?? null,
        modelo: data.modelo ?? null,
        metragem: data.metragem ?? null,
        etiqueta: data.etiqueta ?? null,
        observacoes: data.observacoes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Item 4: gera automaticamente todos os tubos e fibras do cabo.
    const specs = data.construcao?.length
      ? generateFibersFromConstrucao(data.construcao)
      : generateFibersUniform(data.tubos, data.fibrasPorTubo);
    const rows = specs.map((s) => ({
      cable_id: cable.id,
      provider_id: providerId,
      numero_global: s.numero_global,
      tubo_numero: s.tubo_numero,
      tubo_cor: s.tubo_cor,
      fibra_numero_no_tubo: s.fibra_numero_no_tubo,
      fibra_cor: s.fibra_cor,
    }));
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: fErr } = await supabaseAdmin.from("optical_fibers").insert(rows.slice(i, i + BATCH));
      if (fErr) throw new Error(fErr.message);
    }
    return { id: cable.id, totalFibras: rows.length };
  });

export const listOpticalCables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ceoId: string }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("optical_cables")
      .select("*")
      .eq("provider_id", providerId)
      .eq("ceo_id", data.ceoId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listOpticalFibers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cableId: string }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("optical_fibers")
      .select("*")
      .eq("provider_id", providerId)
      .eq("cable_id", data.cableId)
      .order("numero_global", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateOpticalFiber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    fiberId: string;
    estado?: string;
    identificacao_adicional?: string | null;
    potencia_medida_dbm?: number | null;
    observacoes?: string | null;
  }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fiberId, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("optical_fibers")
      .update(patch)
      .eq("id", fiberId)
      .eq("provider_id", providerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Splitters + saídas (geração automática) ----------

export const createOpticalSplitter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    ceoId: string;
    codigo: string;
    tipo: string;
    fabricante?: string;
    modelo?: string;
    numeroSerie?: string;
    patrimonio?: string;
    bandeja?: string;
    posicaoFisica?: string;
    perdaNominalDb?: number | null;
    toleranciaDb?: number | null;
    comprimentoOndaNm?: number | null;
    observacoes?: string;
  }) => {
    if (!data.ceoId) throw new Error("CEO obrigatória.");
    if (!data.codigo?.trim()) throw new Error("Código do splitter obrigatório.");
    const n = outputsForSplitterType(data.tipo);
    if (n < 1) throw new Error("Tipo de splitter inválido (ex.: 1x8).");
    return data;
  })
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const numSaidas = outputsForSplitterType(data.tipo);

    const { data: splitter, error } = await supabaseAdmin
      .from("optical_splitters")
      .insert({
        provider_id: providerId,
        ceo_id: data.ceoId,
        codigo: data.codigo,
        tipo: data.tipo,
        num_saidas: numSaidas,
        fabricante: data.fabricante ?? null,
        modelo: data.modelo ?? null,
        numero_serie: data.numeroSerie ?? null,
        patrimonio: data.patrimonio ?? null,
        bandeja: data.bandeja ?? null,
        posicao_fisica: data.posicaoFisica ?? null,
        perda_nominal_db: data.perdaNominalDb ?? null,
        tolerancia_db: data.toleranciaDb ?? null,
        comprimento_onda_nm: data.comprimentoOndaNm ?? null,
        observacoes: data.observacoes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Item 7: cria automaticamente a numeração/cor de cada saída.
    const outputs = Array.from({ length: numSaidas }, (_, i) => ({
      splitter_id: splitter.id,
      provider_id: providerId,
      porta_numero: i + 1,
      cor: colorForIndex(i + 1),
      estado: "livre",
    }));
    const { error: oErr } = await supabaseAdmin.from("optical_splitter_outputs").insert(outputs);
    if (oErr) throw new Error(oErr.message);

    return { id: splitter.id, numSaidas };
  });

export const listOpticalSplitters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ceoId: string }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("optical_splitters")
      .select("*")
      .eq("provider_id", providerId)
      .eq("ceo_id", data.ceoId)
      .order("codigo", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Item 8: fibra alimentadora do splitter (bloqueia concluir sem isso —
// aplicado na UI, não aqui, pois o cadastro pode ficar em rascunho).
export const setSplitterFeedingFiber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    splitterId: string;
    fibraId: string | null;
    potenciaEntradaDbm?: number | null;
    equipamentoMedicao?: string | null;
  }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("optical_splitters")
      .update({
        fibra_alimentadora_id: data.fibraId,
        potencia_entrada_dbm: data.potenciaEntradaDbm ?? null,
        equipamento_medicao: data.equipamentoMedicao ?? null,
        medicao_entrada_em: data.potenciaEntradaDbm != null ? new Date().toISOString() : null,
      })
      .eq("id", data.splitterId)
      .eq("provider_id", providerId);
    if (error) throw new Error(error.message);
    if (data.fibraId) {
      await supabaseAdmin
        .from("optical_fibers")
        .update({ estado: "alimentadora_splitter" })
        .eq("id", data.fibraId)
        .eq("provider_id", providerId);
    }
    return { ok: true };
  });

export const listOpticalSplitterOutputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { splitterId: string }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("optical_splitter_outputs")
      .select("*, optical_ctos(codigo, nome)")
      .eq("provider_id", providerId)
      .eq("splitter_id", data.splitterId)
      .order("porta_numero", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Item 9/10/11: atribui destino de uma saída (CTO/CEO/splitter
// secundário/reserva) com o cabo/fibra de distribuição e medições.
export const setSplitterOutput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    outputId: string;
    estado: string;
    cabovDistribuicaoId?: string | null;
    fibraDistribuicaoId?: string | null;
    ctoId?: string | null;
    ceoDestinoId?: string | null;
    splitterSecundarioId?: string | null;
    potenciaSaidaDbm?: number | null;
    potenciaChegadaDbm?: number | null;
    observacoes?: string | null;
  }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("optical_splitter_outputs")
      .update({
        estado: data.estado,
        cabo_distribuicao_id: data.cabovDistribuicaoId ?? null,
        fibra_distribuicao_id: data.fibraDistribuicaoId ?? null,
        cto_id: data.ctoId ?? null,
        ceo_destino_id: data.ceoDestinoId ?? null,
        splitter_secundario_id: data.splitterSecundarioId ?? null,
        potencia_saida_dbm: data.potenciaSaidaDbm ?? null,
        potencia_chegada_dbm: data.potenciaChegadaDbm ?? null,
        observacoes: data.observacoes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.outputId)
      .eq("provider_id", providerId);
    if (error) throw new Error(error.message);
    if (data.fibraDistribuicaoId) {
      const fiberState = data.estado === "cto" ? "alimentando_cto" : data.estado === "ceo" ? "alimentando_ceo" : "saida_splitter";
      await supabaseAdmin
        .from("optical_fibers")
        .update({ estado: fiberState })
        .eq("id", data.fibraDistribuicaoId)
        .eq("provider_id", providerId);
    }
    return { ok: true };
  });

// ---------- CTOs ----------

export const listOpticalCtos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("optical_ctos")
      .select("*")
      .eq("provider_id", providerId)
      .order("codigo", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createOpticalCto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    codigo: string;
    nome?: string;
    cidade?: string;
    bairro?: string;
    capacidade?: number | null;
    fabricante?: string;
    modelo?: string;
    clientesAtivos?: number | null;
    observacoes?: string;
  }) => {
    if (!data.codigo?.trim()) throw new Error("Código da CTO obrigatório.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderWriter(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("optical_ctos")
      .insert({
        provider_id: providerId,
        codigo: data.codigo,
        nome: data.nome ?? null,
        cidade: data.cidade ?? null,
        bairro: data.bairro ?? null,
        capacidade: data.capacidade ?? null,
        fabricante: data.fabricante ?? null,
        modelo: data.modelo ?? null,
        clientes_ativos: data.clientesAtivos ?? 0,
        observacoes: data.observacoes ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.message.includes("duplicate key")) throw new Error("Já existe uma CTO com esse código.");
      throw new Error(error.message);
    }
    return row;
  });

// Item 22: "Rastrear alimentação da CTO" — busca a rota completa de trás
// pra frente a partir do código da CTO.
export const traceCtoFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ctoId: string }) => data)
  .handler(async ({ data, context }) => {
    const providerId = await requireProviderId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: output } = await supabaseAdmin
      .from("optical_splitter_outputs")
      .select("*")
      .eq("provider_id", providerId)
      .eq("cto_id", data.ctoId)
      .maybeSingle();
    if (!output) return null;

    const { data: splitter } = await supabaseAdmin
      .from("optical_splitters")
      .select("*, optical_ceos(codigo, nome)")
      .eq("id", output.splitter_id)
      .maybeSingle();

    const { data: fibraAlimentadora } = splitter?.fibra_alimentadora_id
      ? await supabaseAdmin
          .from("optical_fibers")
          .select("*, optical_cables(codigo)")
          .eq("id", splitter.fibra_alimentadora_id)
          .maybeSingle()
      : { data: null };

    const { data: fibraDistribuicao } = output.fibra_distribuicao_id
      ? await supabaseAdmin
          .from("optical_fibers")
          .select("*, optical_cables(codigo)")
          .eq("id", output.fibra_distribuicao_id)
          .maybeSingle()
      : { data: null };

    return { output, splitter, fibraAlimentadora, fibraDistribuicao };
  });
