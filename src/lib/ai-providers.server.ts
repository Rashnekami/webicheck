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
  /** Modelo alternativo capaz de ler imagens. Ausente = provedor só de texto. */
  visionModel?: string;
};

/** Timeout por chamada. Sem isto um provedor lento trava o lote inteiro. */
const AI_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45_000;

export function aiProviders(): AiProviderConfig[] {
  return [
    {
      name: "lovable",
      envKey: "LOVABLE_API_KEY",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      model: "google/gemini-2.5-flash",
      visionModel: "google/gemini-2.5-flash",
    },
    {
      name: "openrouter",
      envKey: "OPENROUTER_API_KEY",
      baseURL: "https://openrouter.ai/api/v1",
      model: "google/gemini-2.5-flash",
      visionModel: "google/gemini-2.5-flash",
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
      // llama-3.3-70b-versatile e somente texto; visao exige um modelo dedicado.
      visionModel: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
    },
    {
      name: "github",
      envKey: "GITHUB_MODELS_TOKEN",
      baseURL: "https://models.github.ai/inference",
      model: "openai/gpt-4o-mini",
      visionModel: "openai/gpt-4o-mini",
    },
    {
      name: "openai",
      envKey: "OPENAI_API_KEY",
      baseURL: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini",
      visionModel: process.env.OPENAI_MODEL_VISION || "gpt-4o-mini",
    },
  ];
}

/** Imagem para leitura por IA. `dataUrl` no formato `data:image/png;base64,...`. */
export type AiImageInput = { dataUrl: string };

async function callProvider(
  cfg: AiProviderConfig,
  apiKey: string,
  prompt: string,
  images?: AiImageInput[],
): Promise<string> {
  const useVision = Boolean(images?.length);
  const model = useVision ? cfg.visionModel : cfg.model;
  if (!model) throw new Error(`${cfg.name}: sem modelo de visão`);

  const userContent = useVision
    ? [
        { type: "text", text: prompt },
        ...images!.map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })),
      ]
    : prompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          {
            role: "system",
            content: "Você responde apenas com JSON válido conforme o schema pedido.",
          },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new Error(`${cfg.name}: tempo esgotado (${AI_TIMEOUT_MS}ms)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${cfg.name} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${cfg.name}: resposta vazia`);
  return text;
}

/** Escapa quebras de linha e outros caracteres de controle dentro de strings JSON. */
function escapeControlCharsInStrings(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of input) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

export function parseAiJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const candidates: string[] = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));

  for (const candidate of candidates) {
    for (const text of [candidate, escapeControlCharsInStrings(candidate)]) {
      try {
        return JSON.parse(text);
      } catch {
        /* tenta o próximo formato */
      }
    }
  }
  throw new Error("A IA não retornou JSON válido.");
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

/**
 * Mesma cascata, com imagens anexadas (extração de dados de print de tela).
 * Pula provedores sem modelo de visão configurado.
 */
export async function runAiVisionPrompt(
  prompt: string,
  images: AiImageInput[],
): Promise<{ raw: string; model: string }> {
  if (!images.length) throw new Error("Nenhuma imagem enviada para leitura.");
  const attempts: string[] = [];
  for (const cfg of aiProviders()) {
    const apiKey = process.env[cfg.envKey];
    if (!apiKey) {
      attempts.push(`${cfg.name}: sem chave`);
      continue;
    }
    if (!cfg.visionModel) {
      attempts.push(`${cfg.name}: sem modelo de visão`);
      continue;
    }
    try {
      const raw = await callProvider(cfg, apiKey, prompt, images);
      return { raw, model: `${cfg.name}:${cfg.visionModel}` };
    } catch (e) {
      attempts.push((e as Error).message);
    }
  }
  throw new Error(`Falha ao ler as imagens. Tentativas: ${attempts.join(" | ")}`);
}
