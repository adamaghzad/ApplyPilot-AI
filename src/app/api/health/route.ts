import { dbReady, dbDriver } from "@/lib/db";
import { gmailConfigured, outlookConfigured, redisConfigured, DEMO_MODE } from "@/lib/env";
import { aiStatus } from "@/lib/ai/providers";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const ai = aiStatus();
    return ok({
      status: "healthy",
      driver: dbDriver(),
      integrations: {
        ai: ai.configured,
        gmail: gmailConfigured,
        outlook: outlookConfigured,
        redis: redisConfigured,
      },
      ai: {
        configured: ai.configured,
        provider: ai.provider,
        providerLabel: ai.providerLabel,
        model: ai.model,
        freeTier: ai.freeTier,
        reason: ai.reason,
      },
      demoMode: DEMO_MODE,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}
