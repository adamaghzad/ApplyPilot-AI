/**
 * Real-time event bus.
 *
 * Server-sent events are the primary transport: API routes and background workers
 * publish domain events here, `/api/events/stream` fans them out to the browser.
 * The bus is in-process by design (single Node server). For multi-instance
 * deployments, swap the transport with Redis pub/sub or Postgres LISTEN/NOTIFY —
 * the publish/subscribe surface stays identical.
 */

export type RealtimeEvent =
  | { type: "activity"; payload: unknown }
  | { type: "agent"; payload: unknown }
  | { type: "application"; payload: unknown }
  | { type: "job"; payload: unknown }
  | { type: "company"; payload: unknown }
  | { type: "notification"; payload: unknown }
  | { type: "task"; payload: unknown }
  | { type: "ping"; payload: { at: string } };

type Subscriber = (event: RealtimeEvent) => void;

class EventBus {
  private subscribers = new Map<string, Set<Subscriber>>();

  subscribe(userId: string, fn: Subscriber): () => void {
    const set = this.subscribers.get(userId) ?? new Set<Subscriber>();
    set.add(fn);
    this.subscribers.set(userId, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(userId);
    };
  }

  publish(userId: string, event: RealtimeEvent) {
    const set = this.subscribers.get(userId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(event);
      } catch (error) {
        console.error("[events] subscriber failed:", error);
      }
    }
  }

  subscriberCount(userId: string) {
    return this.subscribers.get(userId)?.size ?? 0;
  }
}

const globalForBus = globalThis as unknown as { __applyPilotBus?: EventBus };

export const eventBus = globalForBus.__applyPilotBus ?? new EventBus();
globalForBus.__applyPilotBus = eventBus;

export function publishToUser(userId: string, event: RealtimeEvent) {
  eventBus.publish(userId, event);
}
