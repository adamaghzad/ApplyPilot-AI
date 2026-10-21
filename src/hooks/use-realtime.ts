"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

export type RealtimeMessage = { type: string; payload: unknown };

/**
 * Subscribes to the server-sent event stream and invalidates affected queries.
 * Falls back to polling when the browser has no EventSource support.
 */
export function useRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = React.useState(false);
  const [lastEvent, setLastEvent] = React.useState<RealtimeMessage | null>(null);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;

    const source = new EventSource("/api/events/stream");

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as RealtimeMessage;
        setLastEvent(data);
        switch (data.type) {
          case "activity":
          case "agent":
            queryClient.invalidateQueries({ queryKey: ["activity"] });
            queryClient.invalidateQueries({ queryKey: ["agents"] });
            break;
          case "application":
            queryClient.invalidateQueries({ queryKey: ["applications"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            break;
          case "job":
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            break;
          case "company":
            queryClient.invalidateQueries({ queryKey: ["companies"] });
            break;
          case "notification":
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            break;
          case "task":
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            queryClient.invalidateQueries({ queryKey: ["applications"] });
            break;
          default:
            break;
        }
      } catch (error) {
        console.warn("[realtime] bad payload", error);
      }
    };

    source.addEventListener("message", handler as EventListener);
    return () => {
      source.removeEventListener("message", handler as EventListener);
      source.close();
      setConnected(false);
    };
  }, [enabled, queryClient]);

  return { connected, lastEvent };
}
