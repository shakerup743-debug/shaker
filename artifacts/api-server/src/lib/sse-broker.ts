import { type Response } from "express";

export type SseEventType =
  | "order:created"
  | "ticket:updated"
  | "inventory:low"
  | "stats:updated"
  | "product:unavailable"
  | "product:available"
  | "ingredient:out_of_stock"
  | "product:auto_enabled";

export interface SseEvent {
  type: SseEventType;
  data: unknown;
}

class SseBroker {
  private clients = new Set<Response>();

  addClient(res: Response): void {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  emit(event: SseEvent): void {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get count(): number {
    return this.clients.size;
  }
}

export const sseBroker = new SseBroker();
