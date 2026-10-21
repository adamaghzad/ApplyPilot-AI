import { dbReady, dbDriver } from "@/lib/db";
import { aiConfigured, gmailConfigured, outlookConfigured, redisConfigured, DEMO_MODE } from "@/lib/env";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    return ok({
      status: "healthy",
      driver: dbDriver(),
      integrations: { openai: aiConfigured, gmail: gmailConfigured, outlook: outlookConfigured, redis: redisConfigured },
      demoMode: DEMO_MODE,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}
