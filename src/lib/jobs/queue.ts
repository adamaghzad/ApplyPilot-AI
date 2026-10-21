import { and, asc, eq, lte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { automationTasks, type TaskType } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export type EnqueueInput = {
  userId: string;
  type: TaskType;
  payload?: Record<string, unknown>;
  /** Prevents duplicate work (unique constraint in the database). */
  idempotencyKey?: string;
  runAfter?: Date;
  priority?: number;
  maxAttempts?: number;
};

/** Enqueues a background task. Idempotent when a key is supplied. */
export async function enqueue({
  userId,
  type,
  payload = {},
  idempotencyKey,
  runAfter,
  priority = 5,
  maxAttempts = 3,
}: EnqueueInput) {
  const key = idempotencyKey ?? `${type}:${userId}:${JSON.stringify(payload)}:${runAfter?.toISOString() ?? "now"}`;
  const [task] = await getDb()
    .insert(automationTasks)
    .values({ userId, type, payload, idempotencyKey: key, runAfter: runAfter ?? new Date(), priority, maxAttempts })
    .onConflictDoNothing({ target: automationTasks.idempotencyKey })
    .returning();

  if (task) {
    eventBus.publish(userId, { type: "task", payload: { action: "queued", task } });
    ensureWorker();
  }
  return task ?? null;
}

export async function cancelPendingTasks(userId: string, type?: TaskType) {
  await getDb()
    .update(automationTasks)
    .set({ status: "CANCELLED", finishedAt: new Date() })
    .where(
      type
        ? and(eq(automationTasks.userId, userId), eq(automationTasks.type, type), eq(automationTasks.status, "PENDING"))
        : and(eq(automationTasks.userId, userId), eq(automationTasks.status, "PENDING")),
    );
}

// ─────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────

type WorkerState = { timer: NodeJS.Timeout | null; running: boolean };

const globalForWorker = globalThis as unknown as { __applyPilotWorker?: WorkerState };
const state: WorkerState = globalForWorker.__applyPilotWorker ?? { timer: null, running: false };
globalForWorker.__applyPilotWorker = state;

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 4000);

/** Starts the in-process worker (idempotent). */
export function ensureWorker() {
  if (state.timer) return;
  state.timer = setInterval(() => {
    void drain();
  }, TICK_MS);
  // Do not keep the event loop alive artificially in serverless environments.
  state.timer.unref?.();
  void drain();
}

export function stopWorker() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

/** Claims and executes due tasks until none remain (bounded to avoid starvation). */
export async function drain(maxTasks = 10) {
  if (state.running) return;
  state.running = true;
  try {
    for (let i = 0; i < maxTasks; i += 1) {
      const task = await claimNextTask();
      if (!task) break;
      await executeTask(task);
    }
    // Periodic maintenance: due schedules, follow-ups and scheduled sends.
    await runSchedulerTick();
  } catch (error) {
    console.error("[worker] drain failed:", error);
  } finally {
    state.running = false;
  }
}

async function claimNextTask() {
  const db = getDb();
  const candidates = await db
    .select({ id: automationTasks.id })
    .from(automationTasks)
    .where(and(eq(automationTasks.status, "PENDING"), lte(automationTasks.runAfter, new Date())))
    .orderBy(asc(automationTasks.priority), asc(automationTasks.runAfter))
    .limit(1);

  const candidate = candidates[0];
  if (!candidate) return null;

  const [claimed] = await db
    .update(automationTasks)
    .set({ status: "RUNNING", startedAt: new Date(), attempts: sql`${automationTasks.attempts} + 1` })
    .where(and(eq(automationTasks.id, candidate.id), eq(automationTasks.status, "PENDING")))
    .returning();

  return claimed ?? null;
}

async function executeTask(task: typeof automationTasks.$inferSelect) {
  const started = Date.now();
  try {
    const { handleTask } = await import("./handlers");
    const result = await handleTask(task);
    await getDb()
      .update(automationTasks)
      .set({ status: "COMPLETED", finishedAt: new Date(), result: (result ?? {}) as Record<string, unknown> })
      .where(eq(automationTasks.id, task.id));
    eventBus.publish(task.userId, { type: "task", payload: { action: "completed", id: task.id, result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const attempts = task.attempts ?? 1;
    const willRetry = attempts < (task.maxAttempts ?? 3);
    const backoffMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));

    await getDb()
      .update(automationTasks)
      .set(
        willRetry
          ? { status: "PENDING", error: message, runAfter: new Date(Date.now() + backoffMs) }
          : { status: "FAILED", error: message, finishedAt: new Date() },
      )
      .where(eq(automationTasks.id, task.id));

    console.error(`[worker] task ${task.type} failed (attempt ${attempts}):`, message);
    eventBus.publish(task.userId, {
      type: "task",
      payload: { action: willRetry ? "retrying" : "failed", id: task.id, error: message, attempts },
    });
  } finally {
    console.log(`[worker] ${task.type} finished in ${Date.now() - started}ms`);
  }
}

/** Scheduler tick: runs due automation schedules, sends due applications, drafts follow-ups. */
async function runSchedulerTick() {
  try {
    const { processDueWork } = await import("./scheduler");
    await processDueWork();
  } catch (error) {
    console.error("[worker] scheduler tick failed:", error);
  }
}
