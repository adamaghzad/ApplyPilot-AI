import { getDb } from "@/lib/db";
import { activityEvents, agentRuns, auditLogs, notifications } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";
import type { AgentName } from "@/lib/db/schema";

type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/** Append-only audit trail. Failures never break the request path. */
export async function recordAudit(input: AuditInput) {
  try {
    await getDb().insert(auditLogs).values({
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to write:", error);
  }
}

export async function recordActivity(input: {
  userId: string;
  agent: string;
  message: string;
  type?: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  meta?: Record<string, unknown>;
}) {
  try {
    const [row] = await getDb()
      .insert(activityEvents)
      .values({
        userId: input.userId,
        agent: input.agent,
        message: input.message,
        type: input.type ?? "INFO",
        meta: input.meta ?? {},
      })
      .returning();

    eventBus.publish(input.userId, { type: "activity", payload: row });
    return row;
  } catch (error) {
    console.error("[activity] failed to write:", error);
    return null;
  }
}

export async function notify(input: {
  userId: string;
  title: string;
  body?: string;
  type?: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "APPROVAL";
  href?: string;
}) {
  try {
    const [row] = await getDb()
      .insert(notifications)
      .values({ userId: input.userId, title: input.title, body: input.body ?? "", type: input.type ?? "INFO", href: input.href ?? null })
      .returning();
    eventBus.publish(input.userId, { type: "notification", payload: row });
    return row;
  } catch (error) {
    console.error("[notify] failed to write:", error);
    return null;
  }
}

/** Opens (or reuses) an agent run row and streams progress to the UI. */
export async function startAgentRun(input: {
  userId: string;
  agent: AgentName;
  input?: Record<string, unknown>;
  message?: string;
}) {
  const [run] = await getDb()
    .insert(agentRuns)
    .values({ userId: input.userId, agent: input.agent, status: "RUNNING", input: input.input ?? {}, message: input.message ?? null, progress: 5 })
    .returning();
  eventBus.publish(input.userId, { type: "agent", payload: { action: "started", run } });
  return run;
}

export async function updateAgentRun(
  runId: string,
  userId: string,
  patch: {
    progress?: number;
    message?: string;
    status?: "RUNNING" | "COMPLETED" | "FAILED";
    output?: Record<string, unknown>;
    model?: string;
    promptVersion?: string;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
    error?: string;
  },
) {
  const [run] = await getDb()
    .update(agentRuns)
    .set({
      ...patch,
      ...(patch.status === "COMPLETED" || patch.status === "FAILED" ? { finishedAt: new Date() } : {}),
    })
    .where(eqId(runId))
    .returning();
  if (run) eventBus.publish(userId, { type: "agent", payload: { action: patch.status === "RUNNING" ? "progress" : patch.status?.toLowerCase(), run } });
  return run;
}

// tiny helper to avoid importing drizzle operators in call sites
import { eq } from "drizzle-orm";
const eqId = (id: string) => eq(agentRuns.id, id);
