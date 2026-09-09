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

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Apenas administradores podem acessar a auditoria de sinais.");
  return supabaseAdmin;
}

export const listSignalTechnicians = createServerFn({ method: "GET" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }): Promise<SignalTechnicianOption[]> => {
    const supabaseAdmin = await ensureAdmin(context.userId);
    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!actor) return [];

    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "tecnico" as never);
    if (roleError) throw new Error(roleError.message);
    const ids = (roles ?? []).map((row) => row.user_id);
    if (!ids.length) return [];

    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, city, provider_id, active")
      .in("id", ids)
      .eq("active", true);
    if (!actor.platform_admin && actor.provider_id) query = query.eq("provider_id", actor.provider_id);
    const { data, error } = await query;
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
    const supabaseAdmin = await ensureAdmin(context.userId);
    // Tipos gerados ainda não incluem a migration de sinais no preview.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    let query = db
      .from("signal_cases")
      .select(
        "city, olt, board, port, signal_1310, signal_1490, difference_db, issue_kind, severity, status, cause, present_in_latest_import, recurrence_count",
      )
      .eq("owner_id", context.userId);
    if (data.city) query = query.eq("city", data.city);
    const { data: cases, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (cases ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) throw new Error("Ainda não há dados de sinais para analisar.");

    const closed = rows.filter((row) => row.status === "encerrado" && row.cause);
    const current = rows.filter((row) => row.present_in_latest_import !== false && row.status !== "encerrado");
    const causeCounts = new Map<string, number>();
    for (const row of closed) {
      const key = String(row.cause);
      causeCounts.set(key, (causeCounts.get(key) ?? 0) + 1);
    }
    const networkClusters = new Map<string, number>();
    for (const row of rows.filter((item) => item.cause === "rede" || item.cause === "fusao" || item.cause === "cto_odb" || item.cause === "porta_olt" || item.cause === "atenuacao_externa")) {
      const key = [row.city, row.olt || "", row.board || "", row.port || ""].join(" | ");
      networkClusters.set(key, (networkClusters.get(key) ?? 0) + 1);
    }

    const snapshot = {
      cidade: data.city ?? "Todas",
      total_historico: rows.length,
      casos_atuais_pendentes: current.length,
      encerrados_com_causa: closed.length,
      criticos_atuais: current.filter((row) => row.severity === "critico").length,
      tipos_atuais: {
        desequilibrio: current.filter((row) => row.issue_kind === "desequilibrio").length,
        sinal_ruim: current.filter((row) => row.issue_kind === "sinal_ruim").length,
        ambos: current.filter((row) => row.issue_kind === "ambos").length,
      },
      causas_confirmadas: Object.fromEntries(causeCounts),
      concentracoes_de_rede_confirmadas: Array.from(networkClusters.entries())
        .map(([chave, casos]) => ({ chave, casos }))
        .sort((a, b) => b.casos - a.casos)
        .slice(0, 20),
      recorrencias: rows.filter((row) => Number(row.recurrence_count || 0) > 0).length,
    };

    const prompt = `Você é um engenheiro sênior FTTH/GPON analisando uma auditoria preventiva de sinais ópticos de um ISP.

Critérios usados no painel:
- Desequilíbrio: diferença absoluta entre Signal 1310 e Signal 1490 maior que 3 dB.
- Sinal ruim: qualquer uma das leituras menor ou igual a -25 dBm.
- Crítico: leitura menor ou igual a -28 dBm ou diferença maior/igual a 6 dB.

As causas informadas (ONT, conector, acoplador, splitter, rede etc.) são causas CONFIRMADAS manualmente após atendimento. Não invente causa individual para cliente sem atendimento.
"Rede / infraestrutura" deve ser priorizada quando houver causas confirmadas de rede ou concentração consistente por OLT/placa/PON. Não trate mera correlação como causa comprovada.

Analise o agregado abaixo e responda exclusivamente em JSON válido:
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
- Percentuais de principais_motivos devem usar somente os encerrados com causa confirmada.
- Se a amostra encerrada for pequena, diga isso em ressalvas.
- Destaque padrões de rede para ação de infraestrutura, mas sem afirmar causalidade sem confirmação.
- Não invente OLT, placa, PON, causa ou quantidade.

Dados agregados:
${JSON.stringify(snapshot, null, 2)}`;

    const { runAiPrompt, parseAiJson } = await import("@/lib/ai-providers.server");
    const { raw, model } = await runAiPrompt(prompt);
    const parsed = AiAnalysisSchema.parse(parseAiJson(raw));
    const createdAt = new Date().toISOString();

    const { data: stored, error: storeError } = await db
      .from("signal_ai_analyses")
      .insert({
        owner_id: context.userId,
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
      created_at: stored.created_at ?? createdAt,
      city: data.city ?? null,
    };
  });

export const listSignalAiAnalyses = createServerFn({ method: "GET" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }): Promise<SignalAiAnalysis[]> => {
    const supabaseAdmin = await ensureAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("signal_ai_analyses")
      .select("id, city, model, analysis, created_at")
      .eq("owner_id", context.userId)
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
