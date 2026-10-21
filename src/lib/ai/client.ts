import { env } from "@/lib/env";
import { PROVIDERS, ollamaAvailable, resolveProvider, type ProviderId } from "@/lib/ai/providers";

export const PROMPT_VERSION = "2026.02-v1";

export class AINotConfiguredError extends Error {
  constructor(message = "No model backend is configured — the deterministic local engine is used instead.") {
    super(message);
    this.name = "AINotConfiguredError";
  }
}

export class AIRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AIRequestError";
    this.status = status;
  }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionResult<T> = {
  data: T;
  model: string;
  /** Provider that served the call, e.g. "openrouter:llama-3.3-70b". */
  provider: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  raw: string;
};

type CompleteOptions = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** Model override (prompt versioning / A-B tests). */
  model?: string;
  /** Enforce a JSON object response when the model supports it. */
  json?: boolean;
};

/**
 * Provider-agnostic completion call.
 *
 * Works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Ollama,
 * Together, LM Studio…), with Google Gemini's native API, and degrades to
 * `AINotConfiguredError` when no backend is available so callers can fall back
 * to the deterministic local engine. Every call is metered (tokens + latency).
 */
export async function complete<T>({
  system,
  user,
  temperature = 0.4,
  maxTokens = 1800,
  model,
  json = true,
}: CompleteOptions): Promise<CompletionResult<T>> {
  const resolved = resolveProvider();
  if (!resolved) throw new AINotConfiguredError();

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const target = model ?? resolved.model;
    const id: ProviderId = resolved.provider.id;

    if (id === "ollama") {
      const reachable = await ollamaAvailable();
      if (!reachable) {
        throw new AINotConfiguredError(
          `Ollama is configured but not reachable at ${env.OLLAMA_BASE_URL} — start it with \`ollama serve\`, or unset AI_PROVIDER.`,
        );
      }
    }

    const raw =
      id === "gemini"
        ? await completeGemini({
            apiKey: resolved.apiKey,
            model: target,
            system,
            user,
            temperature,
            maxTokens,
            json,
            signal: controller.signal,
          })
        : await completeChatCompletions({
            baseUrl: resolved.baseUrl,
            apiKey: resolved.apiKey,
            model: target,
            system,
            user,
            temperature,
            maxTokens,
            json,
            jsonMode: resolved.provider.jsonMode,
            signal: controller.signal,
          });

    const result = raw as { content: string; model: string; tokensIn: number; tokensOut: number };
    const parsed = json ? parseJsonSafe<T>(result.content) : ((result.content as unknown) as T);

    return {
      data: parsed,
      model: result.model || target,
      provider: `${id}:${result.model || target}`,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: Date.now() - started,
      raw: result.content,
    };
  } finally {
    clearTimeout(timeout);
  }
}

type WireOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  json: boolean;
  jsonMode: "response_format" | "none";
  signal: AbortSignal;
};

type WireResult = { content: string; model: string; tokensIn: number; tokensOut: number };

/** OpenAI Chat Completions — also Groq, OpenRouter, Ollama, Together, LM Studio… */
async function completeChatCompletions(o: WireOptions): Promise<WireResult> {
  const response = await fetch(`${o.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: o.model,
      temperature: o.temperature,
      max_tokens: o.maxTokens,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.user },
      ],
      ...(o.json && o.jsonMode === "response_format" ? { response_format: { type: "json_object" } } : {}),
      // Ollama keeps models resident; other providers ignore this field.
      ...(o.baseUrl.includes("11434") ? { keep_alive: "10m" } : {}),
    }),
    signal: o.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AIRequestError(`${o.baseUrl} responded ${response.status}: ${text.slice(0, 300)}`, response.status);
  }

  const payload = (await response.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    content: payload.choices?.[0]?.message?.content ?? "",
    model: payload.model ?? o.model,
    tokensIn: payload.usage?.prompt_tokens ?? 0,
    tokensOut: payload.usage?.completion_tokens ?? 0,
  };
}

/** Google Gemini native `generateContent` API. */
async function completeGemini(
  o: Omit<WireOptions, "baseUrl" | "jsonMode"> & { signal: AbortSignal },
): Promise<WireResult> {
  const base = PROVIDERS.gemini.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  const url = `${base}/models/${encodeURIComponent(o.model)}:generateContent?key=${encodeURIComponent(o.apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.user }] }],
      generationConfig: {
        temperature: o.temperature,
        maxOutputTokens: o.maxTokens,
        ...(o.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
    signal: o.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AIRequestError(`Gemini responded ${response.status}: ${text.slice(0, 300)}`, response.status);
  }

  const payload = (await response.json()) as {
    modelVersion?: string;
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  return {
    content: payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    model: payload.modelVersion ?? o.model,
    tokensIn: payload.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: payload.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export function parseJsonSafe<T>(content: string): T {
  const cleaned = content
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new AIRequestError("Model returned invalid JSON");
  }
}

export function isAIUnavailable(error: unknown): boolean {
  return error instanceof AINotConfiguredError || error instanceof AIRequestError;
}

export const AI_MODEL_LABEL = (model: string) =>
  model.startsWith("fallback") ? "Local deterministic engine" : model;
