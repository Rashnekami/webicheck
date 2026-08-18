/**
 * Cascata de provedores de IA compatíveis com a API OpenAI.
 * Uso exclusivo do runtime de servidor (server functions).
 */

export type AiProviderConfig = {
  name: string;
  envKey: string;
  baseURL: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

export function aiProviders(): AiProviderConfig[] {
  return [
    {
      name: "lovable",
      envKey: "LOVABLE_API_KEY",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      model: "google/gemini-2.5-flash",
    },
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
}

async function callProvider(
  cfg: AiProviderConfig,
  apiKey: string,
  prompt: string,
): Promise<string> {
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
        {
          role: "system",
          content: "Você responde apenas com JSON válido conforme o schema pedido.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${cfg.name} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${cfg.name}: resposta vazia`);
  return text;
}

export function parseAiJson(raw: string): unknown {
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

/** Percorre a cascata até um provedor responder. Lança se todos falharem. */
export async function runAiPrompt(prompt: string): Promise<{ raw: string; model: string }> {
  const attempts: string[] = [];
  for (const cfg of aiProviders()) {
    const apiKey = process.env[cfg.envKey];
    if (!apiKey) {
      attempts.push(`${cfg.name}: sem chave`);
      continue;
    }
    try {
      const raw = await callProvider(cfg, apiKey, prompt);
      return { raw, model: `${cfg.name}:${cfg.model}` };
    } catch (e) {
      attempts.push((e as Error).message);
    }
  }
  throw new Error(`Falha ao chamar provedores de IA. Tentativas: ${attempts.join(" | ")}`);
}
