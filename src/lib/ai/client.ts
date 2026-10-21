import { env } from "@/lib/env";

export const PROMPT_VERSION = "2026.02-v1";

export class AINotConfiguredError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured — the deterministic local engine is used instead.");
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
 * Minimal, dependency-free OpenAI Chat Completions client.
 *
 * Uses `response_format: json_object` for structured outputs and validates/parses
 * the payload before it reaches agent code. Every call is metered (tokens + latency)
 * so generations can be logged, evaluated and compared across prompt versions.
 */
export async function complete<T>({
  system,
  user,
  temperature = 0.4,
  maxTokens = 1800,
  model,
  json = true,
}: CompleteOptions): Promise<CompletionResult<T>> {
  if (!env.OPENAI_API_KEY) throw new AINotConfiguredError();

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model ?? env.OPENAI_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AIRequestError(`OpenAI responded ${response.status}: ${text.slice(0, 300)}`, response.status);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = json ? parseJsonSafe<T>(content) : (content as unknown as T);

    return {
      data: parsed,
      model: payload.model ?? model ?? env.OPENAI_MODEL,
      tokensIn: payload.usage?.prompt_tokens ?? 0,
      tokensOut: payload.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
      raw: content,
    };
  } finally {
    clearTimeout(timeout);
  }
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
