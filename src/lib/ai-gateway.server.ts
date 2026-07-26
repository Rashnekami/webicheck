/**
 * Gateway server-side para os provedores consultivos do Webi NOC.
 *
 * A política default é `free_only`: uma análise nunca pode cair em um modelo
 * pago silenciosamente. O frontend recebe somente status, modelos e métricas.
 */
export type AiGatewayProvider = "groq" | "openrouter" | "github_deepseek" | "github_llama" | "openai";
export type AiGatewayMode = "triage" | "review";
export type AiGatewayCostClass = "free" | "paid" | "unknown";

export interface AiGatewayProviderStatus {
  provider: AiGatewayProvider;
  label: string;
  configured: boolean;
  enabled: boolean;
  costClass: AiGatewayCostClass;
  triageModel: string;
  reviewModel: string;
  lastHealth?: {
    ok: boolean;
    latencyMs: number;
    message?: string;
    checkedAt: string;
  };
}

export interface AiGatewayCallResult {
  provider: AiGatewayProvider;
  model: string;
  requestId: string | null;
  outputText: string;
  latencyMs: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

type ProviderDefinition = {
  provider: AiGatewayProvider;
  label: string;
  apiKey: string;
  endpoint: string;
  triageModel: string;
  reviewModel: string;
  costClass: AiGatewayCostClass;
  headers?: Record<string, string>;
};

type ChatPayload = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
};

const FREE_ONLY = (process.env.AI_COST_MODE?.trim() || "free_only") === "free_only";
const REQUEST_TIMEOUT_MS = 25_000;

function configuredValue(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function definitions(): ProviderDefinition[] {
  return [
    {
      provider: "groq",
      label: "Groq",
      apiKey: configuredValue("GROQ_API_KEY"),
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      triageModel: configuredValue("GROQ_MODEL_TRIAGE", "openai/gpt-oss-20b"),
      reviewModel: configuredValue("GROQ_MODEL_REVIEW", "openai/gpt-oss-120b"),
      costClass: configuredValue("GROQ_COST_CLASS", "free") === "free" ? "free" : "unknown",
    },
    {
      provider: "openrouter",
      label: "OpenRouter",
      apiKey: configuredValue("OPENROUTER_API_KEY"),
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      triageModel: configuredValue("OPENROUTER_MODEL_TRIAGE", "meta-llama/llama-3.3-70b-instruct:free"),
      reviewModel: configuredValue("OPENROUTER_MODEL_REVIEW", "meta-llama/llama-3.3-70b-instruct:free"),
      costClass: configuredValue("OPENROUTER_COST_CLASS", "free") === "free" ? "free" : "unknown",
      headers: { "HTTP-Referer": configuredValue("APP_ORIGIN", "https://checktecnico.life"), "X-Title": "WebiCheck" },
    },
    {
      provider: "github_deepseek",
      label: "GitHub Models · DeepSeek",
      apiKey: configuredValue("GITHUB_MODELS_TOKEN"),
      endpoint: configuredValue("GITHUB_MODELS_ENDPOINT", "https://models.github.ai/inference/chat/completions"),
      triageModel: configuredValue("GITHUB_DEEPSEEK_MODEL", "deepseek/DeepSeek-V3-0324"),
      reviewModel: configuredValue("GITHUB_DEEPSEEK_MODEL", "deepseek/DeepSeek-V3-0324"),
      costClass: configuredValue("GITHUB_MODELS_COST_CLASS", "free") === "free" ? "free" : "unknown",
    },
    {
      provider: "github_llama",
      label: "GitHub Models · Llama",
      apiKey: configuredValue("GITHUB_MODELS_TOKEN"),
      endpoint: configuredValue("GITHUB_MODELS_ENDPOINT", "https://models.github.ai/inference/chat/completions"),
      triageModel: configuredValue("GITHUB_LLAMA_MODEL", "meta/Llama-3.3-70B-Instruct"),
      reviewModel: configuredValue("GITHUB_LLAMA_MODEL", "meta/Llama-3.3-70B-Instruct"),
      costClass: configuredValue("GITHUB_MODELS_COST_CLASS", "free") === "free" ? "free" : "unknown",
    },
    {
      provider: "openai",
      label: "OpenAI",
      apiKey: configuredValue("OPENAI_API_KEY"),
      endpoint: "https://api.openai.com/v1/chat/completions",
      triageModel: configuredValue("OPENAI_MODEL_TRIAGE", "gpt-5-nano"),
      reviewModel: configuredValue("OPENAI_MODEL_REVIEW", "gpt-5-mini"),
      costClass: "paid",
    },
  ];
}

export function getAiGatewayConfiguration() {
  const providers = definitions().map<AiGatewayProviderStatus>((item) => ({
    provider: item.provider,
    label: item.label,
    configured: Boolean(item.apiKey),
    enabled: Boolean(item.apiKey) && (!FREE_ONLY || item.costClass === "free"),
    costClass: item.costClass,
    triageModel: item.triageModel,
    reviewModel: item.reviewModel,
  }));
  const free = providers.filter((item) => item.enabled && item.costClass === "free");
  return {
    costMode: FREE_ONLY ? "free_only" : "controlled",
    configured: free.length > 0 || (!FREE_ONLY && providers.some((item) => item.enabled)),
    triageModel: free[0]?.triageModel ?? providers.find((item) => item.provider === "openai")?.triageModel ?? "",
    reviewModel: free[0]?.reviewModel ?? providers.find((item) => item.provider === "openai")?.reviewModel ?? "",
    providers,
  };
}

function enabledDefinitions(allowPaid = false): ProviderDefinition[] {
  return definitions().filter(
    (item) =>
      Boolean(item.apiKey) &&
      (!FREE_ONLY || item.costClass === "free" || (allowPaid && item.provider === "openai")),
  );
}

function orderedProviders(sessionId: string, allowPaid: boolean, requested?: AiGatewayProvider) {
  const enabled = enabledDefinitions(allowPaid);
  if (requested) {
    const chosen = enabled.find((item) => item.provider === requested);
    if (!chosen) throw new Error("O provider selecionado não está disponível para este modo de custo.");
    return [chosen];
  }
  const free = enabled.filter((item) => item.costClass === "free");
  if (!free.length) throw new Error("Nenhum provider gratuito está configurado no ambiente.");
  const hash = [...sessionId].reduce((total, char) => total + char.charCodeAt(0), 0);
  const start = hash % free.length;
  return [...free.slice(start), ...free.slice(0, start)];
}

function outputText(payload: ChatPayload | null): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text ?? "").join("");
  return "";
}

function cleanJsonText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

export function parseGatewayJson(value: string): unknown {
  return JSON.parse(cleanJsonText(value));
}

async function invoke(
  provider: ProviderDefinition,
  mode: AiGatewayMode,
  instructions: string,
  input: unknown,
): Promise<Omit<AiGatewayCallResult, "fallbackUsed" | "fallbackReason">> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.headers,
      },
      body: JSON.stringify({
        model: mode === "review" ? provider.reviewModel : provider.triageModel,
        temperature: 0.1,
        max_tokens: mode === "review" ? 1_800 : 1_200,
        messages: [
          { role: "system", content: `${instructions}\nResponda somente JSON válido, sem markdown.` },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as ChatPayload | null;
    if (!response.ok) {
      throw new Error(payload?.error?.message?.slice(0, 400) || `Falha HTTP ${response.status}`);
    }
    const text = outputText(payload);
    if (!text) throw new Error("O provider não retornou conteúdo estruturado.");
    return {
      provider: provider.provider,
      model: mode === "review" ? provider.reviewModel : provider.triageModel,
      requestId: response.headers.get("x-request-id") ?? response.headers.get("x-github-request-id"),
      outputText: text,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: payload?.usage?.prompt_tokens ?? null,
        outputTokens: payload?.usage?.completion_tokens ?? null,
        totalTokens: payload?.usage?.total_tokens ?? null,
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tempo limite de 25 segundos excedido.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAiGateway(input: {
  sessionId: string;
  mode: AiGatewayMode;
  instructions: string;
  payload: unknown;
  provider?: AiGatewayProvider;
  allowPaid?: boolean;
}): Promise<AiGatewayCallResult> {
  const candidates = orderedProviders(input.sessionId, Boolean(input.allowPaid), input.provider);
  const errors: string[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const result = await invoke(candidates[index], input.mode, input.instructions, input.payload);
      return {
        ...result,
        fallbackUsed: index > 0,
        fallbackReason: index > 0 ? errors.join(" | ").slice(0, 500) : null,
      };
    } catch (error) {
      errors.push(`${candidates[index].label}: ${error instanceof Error ? error.message : "falha"}`);
    }
  }
  throw new Error(`Nenhum provider gratuito respondeu. ${errors.join(" | ").slice(0, 700)}`);
}

export async function healthCheckAiGateway(allowPaid = false): Promise<AiGatewayProviderStatus[]> {
  const statuses = getAiGatewayConfiguration().providers;
  const allowed = enabledDefinitions(allowPaid);
  return Promise.all(
    statuses.map(async (status) => {
      const definition = allowed.find((item) => item.provider === status.provider);
      if (!definition) return status;
      const started = Date.now();
      try {
        await invoke(definition, "triage", "Responda somente JSON válido: {\"ok\":true}", { operation: "health_check" });
        return { ...status, lastHealth: { ok: true, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() } };
      } catch (error) {
        return {
          ...status,
          lastHealth: {
            ok: false,
            latencyMs: Date.now() - started,
            message: error instanceof Error ? error.message.slice(0, 220) : "Falha de conexão",
            checkedAt: new Date().toISOString(),
          },
        };
      }
    }),
  );
}
