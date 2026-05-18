import { useEffect, useRef } from "react";
import { Platform } from "react-native";

type SseHandler = (data: unknown) => void;

interface UseSseOptions {
  events: Record<string, SseHandler>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

const SSE_URL = `${BASE_URL}/api/events`;

/**
 * Parses a complete SSE text buffer (may contain multiple events).
 * Returns the unconsumed tail (incomplete frame) so callers can prepend
 * it to the next chunk — avoiding dropped partial frames.
 */
function parseSseBuffer(
  buffer: string,
  handlers: Record<string, SseHandler>,
): string {
  // Split on double-newline (end of an SSE event block)
  const blocks = buffer.split(/\n\n/);
  // The last element is either empty (buffer ended cleanly) or a partial frame
  const tail = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventType = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim();
      }
    }
    if (!data) continue;
    const handler = handlers[eventType];
    if (handler) {
      try {
        handler(JSON.parse(data));
      } catch {
        handler(data);
      }
    }
  }

  return tail; // caller prepends this to next chunk
}

export function useSse({
  events,
  onConnect,
  onDisconnect,
  enabled = true,
}: UseSseOptions) {
  const eventsRef = useRef(events);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  eventsRef.current = events;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  useEffect(() => {
    if (!enabled) return;

    // ── Web path: native EventSource ──────────────────────────────────────
    if (Platform.OS === "web") {
      if (typeof EventSource === "undefined") return;

      let es: EventSource | null = null;
      let retryTimeout: ReturnType<typeof setTimeout>;
      let retryDelay = 2000;

      function connect() {
        es = new EventSource(SSE_URL);

        es.onopen = () => {
          retryDelay = 2000;
          onConnectRef.current?.();
        };

        es.onerror = () => {
          es?.close();
          onDisconnectRef.current?.();
          retryTimeout = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        };

        for (const [type, handler] of Object.entries(eventsRef.current)) {
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
        clearTimeout(retryTimeout);
        es?.close();
        onDisconnectRef.current?.();
      };
    }

    // ── Native path: XHR-based streaming SSE ─────────────────────────────
    // Uses a mutable ref so cleanup always aborts the *current* connection
    // even after reconnects.
    const activeXhr = { current: null as XMLHttpRequest | null };
    let cancelled = false;
    let retryDelay = 2000;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      let seenBytes = 0;
      let partialFrame = "";
      let connected = false;

      const xhr = new XMLHttpRequest();
      activeXhr.current = xhr; // track latest XHR for cleanup
      xhr.open("GET", SSE_URL, true);

      xhr.onprogress = () => {
        if (!connected) {
          connected = true;
          retryDelay = 2000;
          onConnectRef.current?.();
        }

        const full = xhr.responseText;
        const newChunk = full.substring(seenBytes);
        seenBytes = full.length;

        // Prepend any leftover partial frame from the previous chunk
        const toProcess = partialFrame + newChunk;
        partialFrame = parseSseBuffer(toProcess, eventsRef.current);
      };

      const handleClose = () => {
        if (cancelled) return;
        onDisconnectRef.current?.();
        const delay = retryDelay;
        retryDelay = Math.min(retryDelay * 2, 30_000);
        retryTimeout = setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };

      xhr.onerror = handleClose;
      xhr.onload = handleClose;
      xhr.ontimeout = handleClose;

      xhr.send();
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      activeXhr.current?.abort();
      activeXhr.current = null;
      onDisconnectRef.current?.();
    };
  }, [enabled]);
}
