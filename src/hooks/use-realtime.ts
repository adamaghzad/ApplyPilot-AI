"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

export type RealtimeMessage = { type: string; payload: unknown };

/**
 * A single server-sent event stream shared by the whole app.
 *
 * One EventSource is opened for the shell (and any other subscriber) instead of
 * one per mounted view. Incoming events invalidate exactly the queries they
 * affect, so counters, boards and feeds update from real backend activity.
 * When EventSource is unavailable the callers' `refetchInterval` polling stays
 * in place as the fallback.
 */

type Store = {
  source: EventSource | null;
  connected: boolean;
  lastEvent: RealtimeMessage | null;
  subscribers: Set<() => void>;
  queryClients: Set<ReturnType<typeof useQueryClient>>;
};

const store: Store = {
  source: null,
  connected: false,
  lastEvent: null,
  subscribers: new Set(),
  queryClients: new Set(),
};

function emit() {
  for (const listener of store.subscribers) listener();
}

function handleMessage(event: MessageEvent) {
  let data: RealtimeMessage;
  try {
    data = JSON.parse(event.data) as RealtimeMessage;
  } catch (error) {
    console.warn("[realtime] bad payload", error);
    return;
  }

  store.lastEvent = data;
  emit();

  for (const client of store.queryClients) {
    switch (data.type) {
      case "activity":
      case "agent":
        void client.invalidateQueries({ queryKey: ["activity"] });
        void client.invalidateQueries({ queryKey: ["agents"] });
        break;
      case "application":
        void client.invalidateQueries({ queryKey: ["applications"] });
        void client.invalidateQueries({ queryKey: ["stats"] });
        void client.invalidateQueries({ queryKey: ["notifications"] });
        break;
      case "job":
        void client.invalidateQueries({ queryKey: ["jobs"] });
        void client.invalidateQueries({ queryKey: ["stats"] });
        break;
      case "company":
        void client.invalidateQueries({ queryKey: ["companies"] });
        break;
      case "notification":
        void client.invalidateQueries({ queryKey: ["notifications"] });
        break;
      case "task":
        void client.invalidateQueries({ queryKey: ["tasks"] });
        void client.invalidateQueries({ queryKey: ["applications"] });
        break;
      case "cv":
        void client.invalidateQueries({ queryKey: ["cv"] });
        break;
      default:
        break;
    }
  }
}

function connect() {
  if (store.source || typeof window === "undefined" || typeof EventSource === "undefined") return;

  const source = new EventSource("/api/events/stream");
  store.source = source;

  source.onopen = () => {
    store.connected = true;
    emit();
  };
  source.onerror = () => {
    store.connected = false;
    emit();
  };
  source.addEventListener("message", handleMessage as EventListener);
}

function disconnect() {
  if (!store.source) return;
  store.source.removeEventListener("message", handleMessage as EventListener);
  store.source.close();
  store.source = null;
  store.connected = false;
  emit();
}

/** Subscribes to the shared stream. Returns live connection state and last event. */
export function useRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    if (!enabled) return;
    const listener = () => force();
    store.subscribers.add(listener);
    store.queryClients.add(queryClient);
    connect();

    return () => {
      store.subscribers.delete(listener);
      store.queryClients.delete(queryClient);
      // Tear the stream down only when the last subscriber goes away.
      if (store.subscribers.size === 0) disconnect();
    };
  }, [enabled, queryClient]);

  return { connected: store.connected, lastEvent: store.lastEvent };
}
