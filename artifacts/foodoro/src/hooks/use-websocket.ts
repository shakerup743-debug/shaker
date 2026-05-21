import { useEffect, useRef, useCallback } from "react";

type WsHandler = (payload: unknown) => void;

interface UseWebSocketOptions {
  events: Record<string, WsHandler>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
  tenantId?: number;
  branchId?: number;
  userId?: string;
  role?: string;
}

export function useWebSocket({
  events,
  onConnect,
  onDisconnect,
  enabled = true,
  tenantId,
  branchId,
  userId,
  role,
}: UseWebSocketOptions) {
  const eventsRef = useRef(events);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  eventsRef.current = events;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryDelay = useRef(2000);

  const send = useCallback((type: string, payload?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...(payload ?? {}) }));
    }
  }, []);

  const joinRoom = useCallback((room: string) => send("join", { room }), [send]);
  const leaveRoom = useCallback((room: string) => send("leave", { room: room }), [send]);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      const params = new URLSearchParams();
      if (tenantId) params.set("tenantId", String(tenantId));
      if (branchId) params.set("branchId", String(branchId));
      if (userId) params.set("userId", userId);
      if (role) params.set("role", role);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/api/ws?${params.toString()}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryDelay.current = 2000;
        onConnectRef.current?.();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      };

      ws.onclose = () => {
        onDisconnectRef.current?.();
        retryRef.current = setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; payload?: unknown };
          const handler = eventsRef.current[msg.type];
          if (handler) handler(msg.payload ?? msg);
        } catch {
          // ignore
        }
      };
    }

    connect();

    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [enabled, tenantId, branchId, userId, role, send]);

  return { send, joinRoom, leaveRoom };
}
