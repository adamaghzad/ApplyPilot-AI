import { eventBus, type RealtimeEvent } from "@/lib/events";
import { optionalUser } from "@/lib/auth/session";
import { ensureWorker } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-sent events stream for live agent, application and task updates. */
export async function GET(req: Request) {
  const user = await optionalUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  ensureWorker();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      send({ type: "ping", payload: { at: new Date().toISOString() } });
      unsubscribe = eventBus.subscribe(user.id, send);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* stream closed */
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
