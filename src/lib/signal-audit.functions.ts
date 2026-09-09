import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAccountAuth } from "@/lib/account-auth-middleware";
import { SIGNAL_CITIES } from "@/lib/signal-audit";

export interface SignalTechnicianOption {
  id: string;
  full_name: string;
  city: string | null;
}

const AiAnalysisSchema = z.object({
  resumo: z.string(),
  principais_motivos: z.array(
    z.object({
      causa: z.string(),
      quantidade: z.number(),
      percentual: z.number(),
      leitura: z.string(),
    }),
  ),
  infraestrutura_prioritaria: z.array(
    z.object({
      cidade: z.string(),
      olt: z.string().nullable(),
      placa: z.string().nullable(),
      pon: z.string().nullable(),
      casos: z.number(),
      motivo: z.string(),
    }),
  ),
  insights: z.array(z.string()),
  recomendacoes: z.array(z.string()),
  ressalvas: z.array(z.string()),
});

export type SignalAiAnalysis = z.infer<typeof AiAnalysisSchema> & {
  id?: string;
  model: string;
  created_at: string;
  city: string | null;
};

type ActorContext = {
  providerId: string;
  supabaseAdmin: Awaited<ReturnType<typeof import("@/integrations/supabase/client.server")>>["supabaseAdmin"];
};

async function requireSignalAdmin(userId: string): Promise<ActorContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: roleOk, error: roleError }, { data: actor, error: actorError }] = await Promise.all([
    supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabaseAdmin
      .from("profiles")
      .select("provider_id, active")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (roleError || !roleOk || actorError || !actor?.active || !actor.provider_id) {
    throw new Error("Apenas administradores ativos vinculados a um provedor podem acessar sinais.");
  }
  return { providerId: actor.provider_id, supabaseAdmin };
}

export const listSignalTechnicians = createServerFn({ method: "GET" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }): Promise<SignalTechnicianOption[]> => {
    const { providerId, supabaseAdmin } = await requireSignalAdmin(context.userId);
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "tecnico" as never);
    if (roleError) throw new Error(roleError.message);
    const ids = (roles ?? []).map((row) => row.user_id);
    if (!ids.length) return [];

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, city, active")
      .in("id", ids)
      .eq("provider_id", providerId)
      .eq("active", true);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => ({ id: row.id, full_name: row.full_name || "(sem nome)", city: row.city }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
  });

const RunInput = z.object({ city: z.enum(SIGNAL_CITIES).nullable().optional() });

export const runSignalAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data, context }): Promise<SignalAiAnalysis> => {
    const { providerId, supabaseAdmin } = await requireSignalAdmin(context.userId);
    // Tipos gerados ainda não incluem as migrations recentes de sinais.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    let query = db
      .from("signal_cases")
      .select(
        "city, olt, board, port, signal_1310, signal_1490, difference_db, issue_kind, severity, status, cause, present_in_latest_import, recurrence_count",
      )
      .eq("provider_id", providerId);
    if (data.city) query = query.eq("city", data.city);
    const { data: cases, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (cases ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) throw new Error("Ainda não há dados de sinais para analisar.");

    let ponQuery = db
      .from("signal_pon_stats")
      .select(
        "city, olt, board, port, total_onus, flagged_onus, critical_onus, flagged_percent, median_signal_1490, median_difference_db, infra_suspect, created_at",
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.city) ponQuery = ponQuery.eq("city", data.city);
    const { data: ponRows } = await ponQuery;

    const closed = rows.filter((row) => row.status === "encerrado" && row.cause);
    const current = rows.filter(
      (row) => row.present_in_latest_import !== false && row.status !== "encerrado",
    );
    const causeCounts = new Map<string, number>();
    for (const row of closed) {
      const key = String(row.cause);
      causeCounts.set(key, (causeCounts.get(key) ?? 0) + 1);
    }

    const ponHotspots = ((ponRows ?? []) as Array<Record<string, unknown>>)
      .filter((row) => row.infra_suspect === true)
      .map((row) => ({
        cidade: row.city,
        olt: row.olt,
        placa: row.board,
        pon: row.port,
        total_onus: Number(row.total_onus || 0),
        casos: Number(row.flagged_onus || 0),
        criticos: Number(row.critical_onus || 0),
        percentual_afetado: Number(row.flagged_percent || 0),
        mediana_1490: row.median_signal_1490,
        mediana_diferenca: row.median_difference_db,
      }))
      .sort((a, b) => b.percentual_afetado - a.percentual_afetado)
      .slice(0, 20);

    const snapshot = {
      cidade: data.city ?? "Todas",
      total_historico: rows.length,
      casos_atuais_pendentes: current.length,
      encerrados_com_causa: closed.length,
      criticos_atuais: current.filter((row) => row.severity === "critico").length,
      tipos_atuais: {
        desequilibrio: current.filter((row) => row.issue_kind === "desequilibrio").length,
        sinal_ruim_1490: current.filter((row) => row.issue_kind === "sinal_ruim").length,
        ambos: current.filter((row) => row.issue_kind === "ambos").length,
      },
      causas_confirmadas: Object.fromEntries(causeCounts),
      pons_com_concentracao_operacional: ponHotspots,
      recorrencias: rows.filter((row) => Number(row.recurrence_count || 0) > 0).length,
    };

    const prompt = `Você é um engenheiro sênior FTTH/GPON analisando uma auditoria preventiva de sinais ópticos de um ISP.

Critérios usados no painel:
- Desequilíbrio: diferença absoluta entre Signal 1310 e Signal 1490 maior que 3 dB.
- Sinal absoluto ruim: SOMENTE Signal 1490 menor ou igual a -25 dBm.
- Signal 1310 não gera caso isoladamente; ele é usado para calcular o desequilíbrio e como contexto técnico.
- Crítico: Signal 1490 menor ou igual a -28 dBm OU diferença maior/igual a 6 dB.
- Uma PON pode ser marcada como suspeita de infraestrutura quando há concentração alta de clientes afetados; isso é triagem, não causa confirmada.

As causas informadas após atendimento (ONT, conector, acoplador, splitter, rede etc.) são causas CONFIRMADAS manualmente. Não invente causa individual sem atendimento.

Analise o agregado e responda exclusivamente em JSON válido:
{
  "resumo": string,
  "principais_motivos": [{"causa": string, "quantidade": number, "percentual": number, "leitura": string}],
  "infraestrutura_prioritaria": [{"cidade": string, "olt": string|null, "placa": string|null, "pon": string|null, "casos": number, "motivo": string}],
  "insights": string[],
  "recomendacoes": string[],
  "ressalvas": string[]
}

Regras:
- Português técnico e objetivo.
- Percentuais de motivos usam apenas encerrados com causa confirmada.
- Concentração por PON pode justificar investigação de rede, mas não prova causa raiz.
- Se a amostra encerrada for pequena, registre isso em ressalvas.
- Não invente OLT, placa, PON, causa ou quantidade.

Dados agregados:\n${JSON.stringify(snapshot, null, 2)}`;

    const { runAiPrompt, parseAiJson } = await import("@/lib/ai-providers.server");
    const { raw, model } = await runAiPrompt(prompt);
    const parsed = AiAnalysisSchema.parse(parseAiJson(raw));

    const { data: stored, error: storeError } = await db
      .from("signal_ai_analyses")
      .insert({
        owner_id: context.userId,
        provider_id: providerId,
        city: data.city ?? null,
        model,
        input_snapshot: snapshot,
        analysis: parsed,
      })
      .select("id, created_at")
      .single();
    if (storeError) throw new Error(storeError.message);

    return {
      ...parsed,
      id: stored.id,
      model,
      created_at: stored.created_at,
      city: data.city ?? null,
    };
  });

export const listSignalAiAnalyses = createServerFn({ method: "GET" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }): Promise<SignalAiAnalysis[]> => {
    const { providerId, supabaseAdmin } = await requireSignalAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("signal_ai_analyses")
      .select("id, city, model, analysis, created_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      ...AiAnalysisSchema.parse(row.analysis),
      id: row.id,
      city: row.city,
      model: row.model,
      created_at: row.created_at,
    }));
  });
