import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/services/connections";
import { gmailConfigured, outlookConfigured } from "@/lib/env";
import { fail, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await dbReady();
    const user = await requireUser();
    const connections = await listConnections(user.id);
    return ok({
      connections: connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        emailAddress: connection.emailAddress,
        displayName: connection.displayName,
        status: connection.status,
        dailyLimit: connection.dailyLimit,
        sentToday: connection.sentToday,
        lastUsedAt: connection.lastUsedAt,
        lastError: connection.lastError,
        scopes: connection.scopes,
      })),
      available: { gmail: gmailConfigured, outlook: outlookConfigured },
    });
  } catch (error) {
    return fail(error);
  }
}
