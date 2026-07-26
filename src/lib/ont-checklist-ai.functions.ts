import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { aiAnalysisSchema, type StoredAiAnalysis } from "@/lib/ont-checklist-ai";
import type { ChecklistData } from "@/lib/checklist-schema";

const MODEL_ID = "google/gemini-2.5-flash";

const InputSchema = z.object({ checklistId: z.string().uuid() });

function buildPrompt(row: {
  cliente: string | null;
  os: string | null;
  cidade: string | null;
  modelo: string | null;
  serial: string | null;
  modelo_ont_retirada: string | null;
  serial_ont_retirada: string | null;
  modelo_ont_instalada: string | null;
  serial_ont_instalada: string | null;
  troca_realizada: boolean | null;
  dados: ChecklistData;
}) {
  const d = row.dados;
  const summary = {
    tipo_manutencao: d.tipo_manutencao ?? null,
    equipamento: {
      modelo: row.modelo,
      serial: row.serial,
      retirada: {
        modelo: row.modelo_ont_retirada,
        serial: row.serial_ont_retirada,
      },
      instalada: {
        modelo: row.modelo_ont_instalada,
        serial: row.serial_ont_instalada,
      },
      troca_realizada: row.troca_realizada,
    },
    sintomas: d.sintoma,
    validacao_fisica: d.validacao_fisica,
    teste_cabeado: d.teste_cabeado,
    teste_wifi: d.teste_wifi,
    evidencias: d.evidencias_marcadas,
    resultado_final: d.resultado_final,
    relato: d.relato,
    noc: d.noc,
  };
  return `Você é um engenheiro sênior de operações de rede FTTH da Webifibra revisando o atendimento de um técnico de campo.

Analise o checklist a seguir e responda **exclusivamente** em JSON válido (sem markdown, sem comentários) obedecendo o schema:
{
  "diagnostico_provavel": string,
  "causa_raiz": string,
  "recomendacao": "trocar_ont" | "escalar_noc" | "orientar_cliente" | "retornar_ao_local" | "nenhuma_acao",
  "justificativa": string,
  "inconsistencias": string[],
  "resumo_tecnico": string
}

Regras:
- Use português técnico, direto e sem enfeites.
- "diagnostico_provavel" descreve a hipótese principal em 1 frase.
- "causa_raiz" explica o "por quê" em 1-2 frases.
- "inconsistencias" lista contradições entre respostas/testes (ou vazio se não houver).
- "resumo_tecnico" tem no máximo 4 linhas, adequado para colar no PDF.
- Se houver dados insuficientes, sinalize em "inconsistencias".

Checklist (JSON):
${JSON.stringify(summary, null, 2)}`;
}

export const runOntAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("checklists")
      .select(
        "id, tipo, status, tecnico_id, cliente, os, cidade, modelo, serial, modelo_ont_retirada, serial_ont_retirada, modelo_ont_instalada, serial_ont_instalada, troca_realizada, dados",
      )
      .eq("id", data.checklistId)
      .maybeSingle();
    if (error || !row) throw new Error("Checklist não encontrado.");
    if (row.tipo !== "validacao_ont")
      throw new Error("A análise por IA está disponível apenas para checklists de Validação de ONT.");
    if (row.status !== "rascunho") throw new Error("O checklist já está finalizado.");
    if (row.tecnico_id !== userId) throw new Error("Apenas o técnico responsável pode solicitar a análise.");

    const dados = row.dados as unknown as ChecklistData;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurado.");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway(MODEL_ID);

    const { text } = await generateText({
      model,
      prompt: buildPrompt({ ...row, dados }),
      temperature: 0.2,
    });

    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("A IA não retornou JSON válido.");
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    }

    const analysis = aiAnalysisSchema.parse(parsed);
    const stored: StoredAiAnalysis = {
      ...analysis,
      gerado_em: new Date().toISOString(),
      modelo_ia: MODEL_ID,
      tipo_manutencao: dados.tipo_manutencao ?? null,
    };

    const nextDados: ChecklistData = { ...dados, ai_analysis: stored };
    const { error: updateError } = await supabase
      .from("checklists")
      .update({ dados: nextDados as unknown as never })
      .eq("id", data.checklistId);
    if (updateError) throw new Error("Falha ao salvar a análise no checklist.");

    return stored;
  });
