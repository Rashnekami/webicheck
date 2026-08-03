import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { aiAnalysisSchema, type StoredAiAnalysis } from "@/lib/ont-checklist-ai";
import type { ChecklistData } from "@/lib/checklist-schema";

const InputSchema = z.object({ checklistId: z.string().uuid() });

type ProviderConfig = {
  name: string;
  envKey: string;
  baseURL: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

// Ordem de tentativa: OpenRouter → Groq → GitHub Models → OpenAI (por último).
const PROVIDERS: ProviderConfig[] = [
  {
    name: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash",
    extraHeaders: {
      "HTTP-Referer": "https://checktecnico.life",
      "X-Title": "CheckTecnico",
    },
  },
  {
    name: "groq",
    envKey: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  {
    name: "github",
    envKey: "GITHUB_MODELS_TOKEN",
    baseURL: "https://models.github.ai/inference",
    model: "openai/gpt-4o-mini",
  },
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    baseURL: "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini",
  },
];

function buildPrompt(row: {
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
    equipamento_atual: { modelo: row.modelo, serial: row.serial },
    troca_em_andamento: {
      houve_troca: row.troca_realizada,
      ont_retirada: {
        modelo: row.modelo_ont_retirada,
        serial: row.serial_ont_retirada,
      },
      ont_instalada: {
        modelo: row.modelo_ont_instalada,
        serial: row.serial_ont_instalada,
      },
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

CONTEXTO IMPORTANTE — leia antes de julgar inconsistências:
- Este checklist descreve o **estado do atendimento no momento da visita**, incluindo o motivo da troca. Todos os sintomas, testes e o campo "resultado_final" referem-se à **ONT retirada (a que estava com defeito)**, NÃO à ONT nova instalada.
- Se "troca_em_andamento.houve_troca" for verdadeiro, é natural que "resultado_final.permaneceu = true" e/ou "encaminhado_noc = sim": significa que o problema persistia com o equipamento antigo, o que justificou a substituição. **Isso NÃO é inconsistência.**
- A validação da nova ONT (se resolveu ou não) ocorre em uma **revisão futura do checklist**, não neste documento.
- "tipo_manutencao" é a classificação escolhida pelo técnico. Só aponte como inconsistência se contradisser claramente os sintomas (ex.: "preventiva" com múltiplas falhas críticas). Não critique escolhas neutras como "outro" se houver campo de relato explicando.

Responda **exclusivamente** em JSON válido (sem markdown, sem comentários) seguindo o schema:
{
  "diagnostico_provavel": string,
  "causa_raiz": string,
  "recomendacao": "trocar_ont" | "escalar_noc" | "orientar_cliente" | "retornar_ao_local" | "nenhuma_acao",
  "justificativa": string,
  "inconsistencias": string[],
  "resumo_tecnico": string
}

Regras:
- Português técnico, direto, sem enfeites.
- "diagnostico_provavel": hipótese principal em 1 frase, referente ao equipamento/atendimento.
- "causa_raiz": 1-2 frases explicando o "por quê".
- "inconsistencias": só liste contradições reais (dados faltantes relevantes, testes que se contradizem, campos incoerentes entre si). Se não houver, retorne [].
- "resumo_tecnico": no máximo 4 linhas, adequado para colar no PDF, coerente com o fato de que a troca (se houve) foi a ação corretiva desta visita.
- Se a troca já foi executada, a recomendação normalmente será "escalar_noc" (se ainda houver dúvida sobre causa externa) ou "nenhuma_acao" (se o defeito era claro na ONT retirada). Não recomende "trocar_ont" quando a troca já foi feita nesta visita.

Checklist (JSON):
${JSON.stringify(summary, null, 2)}`;
}

async function callProvider(cfg: ProviderConfig, apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(cfg.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: "Você responde apenas com JSON válido conforme o schema pedido." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${cfg.name} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${cfg.name}: resposta vazia`);
  return text;
}

function parseJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("A IA não retornou JSON válido.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
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
    const prompt = buildPrompt({ ...row, dados });

    const attempts: string[] = [];
    let usedProvider: ProviderConfig | null = null;
    let rawText: string | null = null;

    for (const cfg of PROVIDERS) {
      const apiKey = process.env[cfg.envKey];
      if (!apiKey) {
        attempts.push(`${cfg.name}: sem chave`);
        continue;
      }
      try {
        rawText = await callProvider(cfg, apiKey, prompt);
        usedProvider = cfg;
        break;
      } catch (e) {
        attempts.push((e as Error).message);
      }
    }

    if (!rawText || !usedProvider) {
      throw new Error(`Falha ao chamar provedores de IA. Tentativas: ${attempts.join(" | ")}`);
    }

    const parsed = parseJson(rawText);
    const analysis = aiAnalysisSchema.parse(parsed);
    const stored: StoredAiAnalysis = {
      ...analysis,
      gerado_em: new Date().toISOString(),
      modelo_ia: `${usedProvider.name}:${usedProvider.model}`,
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
