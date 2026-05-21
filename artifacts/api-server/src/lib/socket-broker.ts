import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger.js";

export interface WsEvent {
  type: string;
  payload: unknown;
  tenantId?: number;
  branchId?: number;
  timestamp: string;
}

interface WsClient {
  ws: WebSocket;
  tenantId?: number;
  branchId?: number;
  userId?: string;
  role?: string;
  rooms: Set<string>;
}

class SocketBroker {
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, WsClient>();

  attach(server: Server): void {
    // Mount under /api so the standard Kubernetes ingress (/api/* → backend)
    // forwards the WebSocket upgrade request. We also keep a /ws alias so
    // direct/localhost clients (and older builds) continue to work.
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/ws" && url.pathname !== "/api/ws") {
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit("connection", ws, req);
      });
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const tenantId = url.searchParams.get("tenantId");
      const branchId = url.searchParams.get("branchId");
      const userId = url.searchParams.get("userId");
      const role = url.searchParams.get("role");

      const client: WsClient = {
        ws,
        tenantId: tenantId ? Number(tenantId) : undefined,
        branchId: branchId ? Number(branchId) : undefined,
        userId: userId ?? undefined,
        role: role ?? undefined,
        rooms: new Set(),
      };

      this.clients.set(ws, client);
      logger.info({ tenantId, branchId, userId, role }, "WebSocket client connected");

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { type: string; room?: string };
          if (msg.type === "join" && msg.room) {
            client.rooms.add(msg.room);
            ws.send(JSON.stringify({ type: "joined", room: msg.room }));
          }
          if (msg.type === "leave" && msg.room) {
            client.rooms.delete(msg.room);
          }
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        logger.info({ userId }, "WebSocket client disconnected");
      });

      ws.on("error", (err) => {
        logger.warn({ err, userId }, "WebSocket error");
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({
        type: "connected",
        timestamp: new Date().toISOString(),
      }));
    });

    logger.info("WebSocket broker attached to server at /ws and /api/ws");
  }

  emit(event: WsEvent): void {
    const msg = JSON.stringify(event);
    for (const [ws, client] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (event.tenantId && client.tenantId && event.tenantId !== client.tenantId) continue;
      if (event.branchId && client.branchId && event.branchId !== client.branchId) continue;
      ws.send(msg);
    }
  }

  emitToRoom(room: string, event: WsEvent): void {
    const msg = JSON.stringify(event);
    for (const [ws, client] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (!client.rooms.has(room)) continue;
      ws.send(msg);
    }
  }

  emitToTenant(tenantId: number, event: WsEvent): void {
    this.emit({ ...event, tenantId });
  }

  broadcast(event: WsEvent): void {
    const msg = JSON.stringify(event);
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const socketBroker = new SocketBroker();
