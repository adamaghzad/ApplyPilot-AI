import { requireUser } from "@/lib/auth/session";
import { aiStatus, ollamaAvailable } from "@/lib/ai/providers";
import { PROMPT_VERSION } from "@/lib/ai/client";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Which model backend is live, whether it is a free tier, and — when nothing is
 * configured — the exact steps to enable one. Consumed by Settings and shown in
 * the agent command centre so the UI never misrepresents the engine in use.
 */
export async function GET() {
  try {
    await requireUser();
    const status = aiStatus();

    let reachable: boolean | null = null;
    if (status.provider === "ollama") reachable = await ollamaAvailable();

    return ok({ ...status, reachable, promptVersion: PROMPT_VERSION });
  } catch (error) {
    return fail(error);
  }
}
