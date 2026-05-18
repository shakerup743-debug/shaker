import { useEffect, useRef } from "react";

type SseHandler = (data: unknown) => void;

interface UseSseOptions {
  events?: Record<string, SseHandler>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

export function useSse({
  events,
  onConnect,
  onDisconnect,
  enabled = true,
}: UseSseOptions) {
  const eventsRef = useRef<Record<string, SseHandler>>({});
  const onConnectRef = useRef<(() => void) | undefined>(undefined);
  const onDisconnectRef = useRef<(() => void) | undefined>(undefined);

  eventsRef.current = events ?? {};
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryDelay = 2000;
    let active = true;

    function connect() {
      if (!active) return;
      es = new EventSource("/api/events");

      es.onopen = () => {
        retryDelay = 2000;
        onConnectRef.current?.();
      };

      es.onerror = () => {
        es?.close();
        es = null;
        onDisconnectRef.current?.();
        if (active) {
          retryTimeout = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30000);
        }
      };

      const handlers = { ...(eventsRef.current ?? {}) };
      for (const [type, handler] of Object.entries(handlers)) {
        es.addEventListener(type, (e: MessageEvent) => {
          try {
            handler(JSON.parse(e.data as string));
          } catch {
            handler(e.data);
          }
        });
      }
    }

    connect();

    return () => {
      active = false;
      clearTimeout(retryTimeout);
      es?.close();
      onDisconnectRef.current?.();
    };
  }, [enabled]);
}
