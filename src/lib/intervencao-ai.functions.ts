import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { intervencaoAiSchema } from "@/lib/intervencao";
import { buildIntervencaoPrompt } from "@/lib/intervencao-ai.server";
import type { IntervencaoData, StoredAiAnalysis } from "@/lib/checklist-schema";

const InputSchema = z.object({ checklistId: z.string().uuid() });
const LaudoSchema = z.object({ path: z.string().min(3) });

const TIPOS = ["rompimento", "readequacao", "melhoria_sinal"];

export const runIntervencaoAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<StoredAiAnalysis> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("checklists")
      .select("id, tipo, status, tecnico_id, cidade, os, dados")
      .eq("id", data.checklistId)
      .maybeSingle();
    if (error || !row) throw new Error("Intervenção não encontrada.");
    if (!TIPOS.includes(row.tipo))
      throw new Error("Esta análise é exclusiva das intervenções de rede.");
    if (row.status !== "rascunho") throw new Error("A intervenção já está finalizada.");
    if (row.tecnico_id !== userId)
      throw new Error("Apenas o técnico responsável pode solicitar a análise.");

    const dados = row.dados as unknown as IntervencaoData;
    const prompt = buildIntervencaoPrompt({
      tipo: row.tipo,
      cidade: row.cidade,
      os: row.os,
      dados,
    });

    const { runAiPrompt, parseAiJson } = await import("@/lib/ai-providers.server");
    const { raw, model } = await runAiPrompt(prompt);
    const analysis = intervencaoAiSchema.parse(parseAiJson(raw));

    const stored = {
      ...analysis,
      gerado_em: new Date().toISOString(),
      modelo_ia: model,
      tipo_manutencao: row.tipo,
    } as unknown as StoredAiAnalysis;

    const nextDados: IntervencaoData = { ...dados, ai_analysis: stored };
    const { error: updateError } = await supabase
      .from("checklists")
      .update({ dados: nextDados as unknown as never })
      .eq("id", data.checklistId);
    if (updateError) throw new Error("Falha ao salvar a análise na intervenção.");
    return stored;
  });

/** URL assinada temporária para abrir um laudo OTDR já enviado. */
export const getOtdrLaudoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LaudoSchema.parse(input))
  .handler(async ({ data, context }): Promise<string | null> => {
    const signed = await context.supabase.storage
      .from("intervencao-laudos")
      .createSignedUrl(data.path, 3600);
    return signed.data?.signedUrl ?? null;
  });
