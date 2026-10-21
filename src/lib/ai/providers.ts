import { env, ollamaEnabled } from "@/lib/env";

/**
 * Provider-agnostic LLM layer.
 *
 * ApplyPilot ships with a deterministic local engine that produces real,
 * grounded output with no network access at all. When a model *is* available
 * the agents upgrade to it — but that model can come from any
 * OpenAI-compatible endpoint, from Google Gemini, or from a **local Ollama**
 * install. Nothing in the product requires a paid OpenAI plan.
 *
 * Resolution order (AI_PROVIDER=auto, the default):
 *   1. explicit AI_PROVIDER
 *   2. first provider whose API key is present — free tiers first
 *      (OpenRouter `:free` models → Groq free tier → Gemini free tier → OpenAI)
 *   3. a reachable Ollama daemon (OLLAMA_BASE_URL)
 *   4. null → agents transparently use the deterministic local engine
 */

export type ProviderId = "openai" | "openrouter" | "groq" | "gemini" | "ollama" | "custom";

export type ModelOption = {
  id: string;
  label: string;
  /** No paid plan required — free tier or self-hosted weights. */
  free: boolean;
  note?: string;
};

export type ProviderDefinition = {
  id: ProviderId;
  label: string;
  /** Chat Completions compatible endpoint (null = provider has its own wire format). */
  baseUrl: string | null;
  /** Env var holding the credential; null for keyless local providers. */
  keyEnv: string | null;
  defaultModel: string;
  models: ModelOption[];
  /** Where to obtain a (free) credential. */
  signupUrl: string;
  /** One-line setup instruction surfaced in Settings and the README. */
  setup: string;
  /** Whether the endpoint honours `response_format: { type: "json_object" }`. */
  jsonMode: "response_format" | "none";
};

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B Instruct", free: true, note: "Best free default" },
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1", free: true, note: "Strong reasoning, slower" },
      { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B", free: true },
      { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B", free: true },
      { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1", free: true },
    ],
    signupUrl: "https://openrouter.ai/keys",
    setup: "Create a free account at openrouter.ai/keys, then set OPENROUTER_API_KEY. The `:free` models cost nothing.",
    jsonMode: "response_format",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", free: true, note: "Free tier, very fast" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", free: true },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", free: true },
      { id: "moonshotai/kimi-k2-instruct-0905", label: "Kimi K2", free: true },
    ],
    signupUrl: "https://console.groq.com/keys",
    setup: "Create a free account at console.groq.com/keys, then set GROQ_API_KEY. The free tier has generous rate limits.",
    jsonMode: "response_format",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", free: true, note: "Free tier available" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", free: true },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", free: true },
    ],
    signupUrl: "https://aistudio.google.com/apikey",
    setup: "Get a free API key at aistudio.google.com/apikey, then set GEMINI_API_KEY.",
    jsonMode: "response_format",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local, zero cost)",
    baseUrl: env.OLLAMA_BASE_URL.replace(/\/$/, ""),
    keyEnv: null,
    defaultModel: "llama3.2",
    models: [
      { id: "llama3.2", label: "Llama 3.2", free: true, note: "Runs on your machine" },
      { id: "qwen2.5", label: "Qwen 2.5", free: true },
      { id: "mistral", label: "Mistral", free: true },
      { id: "phi4", label: "Phi-4", free: true },
    ],
    signupUrl: "https://ollama.com/download",
    setup: "Install Ollama, run `ollama pull llama3.2`, then set AI_PROVIDER=ollama. No key, no cost, no data leaves your machine.",
    jsonMode: "response_format",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: env.OPENAI_BASE_URL.replace(/\/$/, ""),
    keyEnv: "OPENAI_API_KEY",
    defaultModel: env.OPENAI_MODEL,
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", free: false, note: "Paid, ~$0.15/1M tokens" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", free: false },
      { id: "gpt-4o", label: "GPT-4o", free: false },
    ],
    signupUrl: "https://platform.openai.com/api-keys",
    setup: "Set OPENAI_API_KEY. Optional — every other provider here has a free tier.",
    jsonMode: "response_format",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: env.OPENAI_BASE_URL.replace(/\/$/, ""),
    keyEnv: "OPENAI_API_KEY",
    defaultModel: env.OPENAI_MODEL,
    models: [{ id: env.OPENAI_MODEL, label: "As configured in OPENAI_MODEL", free: true }],
    signupUrl: "https://platform.openai.com/docs/api-reference",
    setup:
      "Point OPENAI_BASE_URL at any OpenAI-compatible server (Together, Fireworks, LM Studio, vLLM, OpenRouter…) and set OPENAI_API_KEY.",
    jsonMode: "response_format",
  },
};

/**
 * Providers tried, in order, when AI_PROVIDER=auto. Free tiers come first.
 * Ollama is only auto-tried when the user opted in (explicit OLLAMA_BASE_URL
 * or AI_PROVIDER=ollama) so we never block on a localhost probe by default.
 */
const AUTO_ORDER: ProviderId[] = ["openrouter", "groq", "gemini", "ollama", "openai"];

function autoOrder(): ProviderId[] {
  return ollamaEnabled ? AUTO_ORDER : AUTO_ORDER.filter((id) => id !== "ollama");
}

export type ResolvedProvider = {
  provider: ProviderDefinition;
  model: string;
  /** API key to send (empty for keyless providers). */
  apiKey: string;
  baseUrl: string;
  /** Why this provider was chosen — surfaced in Settings / health. */
  reason: string;
};

function keyFor(id: ProviderId): string {
  const keyEnv = PROVIDERS[id].keyEnv;
  if (!keyEnv) return "";
  return (process.env[keyEnv] ?? "").trim();
}

/**
 * Synchronous resolution: cheap and side-effect free (no network).
 * Ollama is included optimistically; `complete()` probes it and falls back
 * to the local engine if the daemon is not reachable.
 */
export function resolveProvider(): ResolvedProvider | null {
  const requested = env.AI_PROVIDER;
  const modelOverride = env.AI_MODEL.trim();

  if (requested !== "auto") {
    const provider = PROVIDERS[requested];
    const apiKey = keyFor(requested);
    if (provider.keyEnv && !apiKey) return null;
    return {
      provider,
      model: modelOverride || provider.defaultModel,
      apiKey,
      baseUrl: provider.baseUrl ?? "",
      reason: `Explicit AI_PROVIDER=${requested}`,
    };
  }

  for (const id of autoOrder()) {
    const provider = PROVIDERS[id];
    if (provider.keyEnv) {
      const apiKey = keyFor(id);
      if (!apiKey) continue;
      return {
        provider,
        model: modelOverride || provider.defaultModel,
        apiKey,
        baseUrl: provider.baseUrl ?? "",
        reason: `${provider.label} key detected (${provider.keyEnv})`,
      };
    }
    return {
      provider,
      model: modelOverride || provider.defaultModel,
      apiKey: "",
      baseUrl: provider.baseUrl ?? "",
      reason: `${provider.label} at ${provider.baseUrl}`,
    };
  }

  return null;
}

let ollamaProbe: { at: number; ok: boolean } | null = null;

/** Cached reachability probe for the local Ollama daemon. */
export async function ollamaAvailable(): Promise<boolean> {
  if (ollamaProbe && Date.now() - ollamaProbe.at < 60_000) return ollamaProbe.ok;
  let ok = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_500);
    const response = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    ok = response.ok;
  } catch {
    ok = false;
  }
  ollamaProbe = { at: Date.now(), ok };
  return ok;
}

/** Cheap synchronous check: is *any* model backend plausibly configured? */
export function aiConfigured(): boolean {
  return resolveProvider() !== null;
}

export type AIStatus = {
  configured: boolean;
  provider: string | null;
  providerLabel: string | null;
  model: string | null;
  freeTier: boolean;
  reason: string;
  /** Rendered verbatim in Settings when nothing is configured. */
  setupHint: string;
  catalog: { id: ProviderId; label: string; signupUrl: string; setup: string; models: ModelOption[] }[];
};

/** Full status payload for /api/health, /api/ai/status and the Settings UI. */
export function aiStatus(): AIStatus {
  const resolved = resolveProvider();
  const catalog = AUTO_ORDER.map((id) => {
    const p = PROVIDERS[id];
    return { id, label: p.label, signupUrl: p.signupUrl, setup: p.setup, models: p.models };
  });

  if (!resolved) {
    return {
      configured: false,
      provider: null,
      providerLabel: null,
      model: null,
      freeTier: true,
      reason: "No model backend configured — the deterministic local engine is active.",
      setupHint:
        "ApplyPilot runs fully offline on its deterministic engine. To enable a free LLM: install Ollama (`ollama pull llama3.2`) and set AI_PROVIDER=ollama, or set OPENROUTER_API_KEY / GROQ_API_KEY / GEMINI_API_KEY. See README → “Free AI models”.",
      catalog,
    };
  }

  const chosenModel = resolved.provider.models.find((m) => m.id === resolved.model);

  return {
    configured: true,
    provider: resolved.provider.id,
    providerLabel: resolved.provider.label,
    model: resolved.model,
    freeTier: chosenModel?.free ?? resolved.provider.id !== "openai",
    reason: resolved.reason,
    setupHint: resolved.provider.setup,
    catalog,
  };
}
