import { Router } from "express";
import { db } from "@workspace/db";
import { webhooksTable, webhookLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authorize } from "../middleware/authorize.js";
import { requirePlan } from "../middleware/require-plan.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// Webhooks management is a Pro+ feature — apply requirePlan per-route below.
const proOnly = requirePlan("pro");

/* ── List webhooks ── */
router.get("/webhooks", proOnly, authorize("admin", "owner"), async (_req, res) => {
  const hooks = await db.select().from(webhooksTable).orderBy(desc(webhooksTable.createdAt));
  res.json(hooks);
});

/* ── Create webhook ── */
router.post("/webhooks", proOnly, authorize("admin", "owner"), async (req, res) => {
  const { name, url, events, secret } = req.body as {
    name?: string; url?: string; events?: string[]; secret?: string;
  };
  if (!name || !url || !events?.length) {
    res.status(400).json({ error: "name, url, and events are required" });
    return;
  }
  const [hook] = await db.insert(webhooksTable).values({ name, url, events, secret: secret ?? null }).returning();
  await logAudit(req, "create", "webhooks", hook.id, { name, url, events });
  res.status(201).json(hook);
});

/* ── Update webhook ── */
router.patch("/webhooks/:id", proOnly, authorize("admin", "owner"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, url, events, secret, isActive } = req.body as {
    name?: string; url?: string; events?: string[]; secret?: string; isActive?: boolean;
  };
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) update.name = name;
  if (url !== undefined) update.url = url;
  if (events !== undefined) update.events = events;
  if (secret !== undefined) update.secret = secret;
  if (isActive !== undefined) update.isActive = isActive;

  const [hook] = await db.update(webhooksTable).set(update).where(eq(webhooksTable.id, id)).returning();
  if (!hook) { res.status(404).json({ error: "Webhook not found" }); return; }
  res.json(hook);
});

/* ── Delete webhook ── */
router.delete("/webhooks/:id", proOnly, authorize("admin", "owner"), async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(webhookLogsTable).where(eq(webhookLogsTable.webhookId, id));
  await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
  await logAudit(req, "delete", "webhooks", id, {});
  res.status(204).send();
});

/* ── Test webhook ── */
router.post("/webhooks/:id/test", proOnly, authorize("admin", "owner"), async (req, res) => {
  const id = Number(req.params.id);
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }

  const payload = { event: "test", timestamp: new Date().toISOString(), data: { message: "FOODORO webhook test ping" } };
  const start = Date.now();
  let statusCode = 0;
  let success = false;
  let response = "";

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Foodoro-Event": "test", ...(hook.secret ? { "X-Foodoro-Signature": hook.secret } : {}) },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    statusCode = r.status;
    response = await r.text().catch(() => "");
    success = r.ok;
  } catch (e) {
    response = e instanceof Error ? e.message : "Unknown error";
  }

  const durationMs = Date.now() - start;
  await db.insert(webhookLogsTable).values({ webhookId: id, event: "test", payload, statusCode, response: response.slice(0, 1000), durationMs, success });
  await db.update(webhooksTable).set({ lastTriggeredAt: new Date(), failCount: success ? 0 : hook.failCount + 1 }).where(eq(webhooksTable.id, id));

  res.json({ success, statusCode, durationMs, response: response.slice(0, 500) });
});

/* ── Get webhook logs ── */
router.get("/webhooks/:id/logs", proOnly, authorize("admin", "owner"), async (req, res) => {
  const id = Number(req.params.id);
  const logs = await db.select().from(webhookLogsTable).where(eq(webhookLogsTable.webhookId, id)).orderBy(desc(webhookLogsTable.createdAt)).limit(50);
  res.json(logs);
});

export default router;

/* ── Helper: fire webhook for an event ── */
export async function fireWebhooks(event: string, payload: unknown): Promise<void> {
  try {
    const hooks = await db.select().from(webhooksTable).where(eq(webhooksTable.isActive, true));
    const matching = hooks.filter(h => (h.events as string[]).includes(event) || (h.events as string[]).includes("*"));

    await Promise.allSettled(matching.map(async (hook) => {
      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
      const start = Date.now();
      let statusCode = 0;
      let success = false;
      let response = "";
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Foodoro-Event": event,
            "X-Foodoro-Delivery": `${Date.now()}-${hook.id}`,
            ...(hook.secret ? { "X-Foodoro-Signature": hook.secret } : {}),
          },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(timeout);
        statusCode = r.status;
        response = (await r.text().catch(() => "")).slice(0, 500);
        success = r.ok;
      } catch (e) {
        response = e instanceof Error ? e.message : "error";
      }
      const durationMs = Date.now() - start;
      await db.insert(webhookLogsTable).values({ webhookId: hook.id, event, payload: payload as Record<string, unknown>, statusCode, response, durationMs, success });
      await db.update(webhooksTable).set({ lastTriggeredAt: new Date(), failCount: success ? 0 : hook.failCount + 1 }).where(eq(webhooksTable.id, hook.id));
    }));
  } catch {
    // silently fail — never break main request flow
  }
}
