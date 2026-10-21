import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER", "AI_MODEL", "OLLAMA_BASE_URL"];

const saved = new Map<string, string | undefined>();

/** `src/lib/env` snapshots process.env at import time, so reload modules per case. */
async function loadWith(env: Record<string, string>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  const providers = await import("@/lib/ai/providers");
  return { resolveProvider: providers.resolveProvider, aiStatus: providers.aiStatus };
}

beforeEach(() => {
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("resolveProvider", () => {
  it("returns null when nothing is configured, so agents fall back to the local engine", async () => {
    const { resolveProvider } = await loadWith({});
    expect(resolveProvider()).toBeNull();
  });

  it("does not auto-select Ollama unless the user opted in", async () => {
    const { resolveProvider } = await loadWith({});
    expect(resolveProvider()?.provider.id ?? null).not.toBe("ollama");
  });

  it("prefers free tiers over OpenAI when several keys are present", async () => {
    const { resolveProvider } = await loadWith({
      OPENAI_API_KEY: "sk-test",
      GROQ_API_KEY: "gsk-test",
      OPENROUTER_API_KEY: "sk-or-test",
    });

    const resolved = resolveProvider();
    expect(resolved?.provider.id).toBe("openrouter");
    expect(resolved?.model).toContain(":free");
    expect(resolved?.apiKey).toBe("sk-or-test");
  });

  it("falls through to Groq when OpenRouter is absent", async () => {
    const { resolveProvider } = await loadWith({ OPENAI_API_KEY: "sk-test", GROQ_API_KEY: "gsk-test" });
    expect(resolveProvider()?.provider.id).toBe("groq");
  });

  it("uses Gemini when only GEMINI_API_KEY is set", async () => {
    const { resolveProvider } = await loadWith({ GEMINI_API_KEY: "gemini-test" });
    const resolved = resolveProvider();
    expect(resolved?.provider.id).toBe("gemini");
    expect(resolved?.baseUrl).toContain("generativelanguage.googleapis.com");
  });

  it("honours an explicit provider and model override", async () => {
    const { resolveProvider } = await loadWith({ AI_PROVIDER: "ollama", AI_MODEL: "mistral" });
    const resolved = resolveProvider();
    expect(resolved?.provider.id).toBe("ollama");
    expect(resolved?.model).toBe("mistral");
  });

  it("selects Ollama when the user points OLLAMA_BASE_URL somewhere", async () => {
    const { resolveProvider } = await loadWith({ OLLAMA_BASE_URL: "http://192.168.0.10:11434" });
    expect(resolveProvider()?.provider.id).toBe("ollama");
  });

  it("returns null when an explicit provider has no key", async () => {
    const { resolveProvider } = await loadWith({ AI_PROVIDER: "groq" });
    expect(resolveProvider()).toBeNull();
  });
});

describe("aiStatus", () => {
  it("reports the deterministic engine plus setup instructions when unconfigured", async () => {
    const { aiStatus } = await loadWith({});
    const status = aiStatus();
    expect(status.configured).toBe(false);
    expect(status.model).toBeNull();
    expect(status.freeTier).toBe(true);
    expect(status.setupHint).toMatch(/Ollama|OPENROUTER_API_KEY|GROQ_API_KEY|GEMINI_API_KEY/);
    expect(status.catalog.length).toBeGreaterThanOrEqual(4);
  });

  it("flags the chosen model as free tier", async () => {
    const { aiStatus } = await loadWith({ OPENROUTER_API_KEY: "sk-or-test" });
    const status = aiStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("openrouter");
    expect(status.freeTier).toBe(true);
  });

  it("flags OpenAI as a paid tier", async () => {
    const { aiStatus } = await loadWith({ OPENAI_API_KEY: "sk-test" });
    const status = aiStatus();
    expect(status.provider).toBe("openai");
    expect(status.freeTier).toBe(false);
  });
});
