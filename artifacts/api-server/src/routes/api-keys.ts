import { Router } from "express";
import { db } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { authorize } from "../middleware/authorize.js";
import { logAudit } from "../lib/audit.js";
import { createHash, randomBytes } from "crypto";

const router = Router();

const SCOPES = ["read", "write", "orders:read", "orders:write", "reports:read", "inventory:read", "inventory:write", "webhooks:manage"];

function generateKey(): { raw: string; prefix: string; hash: string } {
  const raw = `fdk_${randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

/* ── List API keys ── */
router.get("/developer/api-keys", authorize("admin", "owner"), async (req, res) => {
  const keys = await db.execute<{
    id: number; name: string; key_prefix: string; scopes: string[];
    is_active: boolean; last_used_at: string | null; expires_at: string | null; created_at: string;
  }>(sql`SELECT id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at FROM api_keys ORDER BY created_at DESC`);
  res.json(keys.rows);
});

/* ── Create API key ── */
router.post("/developer/api-keys", authorize("admin", "owner"), async (req, res) => {
  const { name, scopes, expiresAt } = req.body as { name?: string; scopes?: string[]; expiresAt?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const finalScopes = (scopes ?? ["read"]).filter(s => SCOPES.includes(s));
  const { raw, prefix, hash } = generateKey();
  await db.execute(sql`
    INSERT INTO api_keys (name, key_hash, key_prefix, scopes, expires_at)
    VALUES (${name}, ${hash}, ${prefix}, ${JSON.stringify(finalScopes)}::jsonb, ${expiresAt ? new Date(expiresAt) : null})
  `);
  void logAudit(req, "create", "api_keys", 0, { name, scopes: finalScopes });
  // Return the raw key ONCE — never stored
  res.status(201).json({ key: raw, prefix, name, scopes: finalScopes, message: "Save this key — it will not be shown again." });
});

/* ── Revoke API key ── */
router.delete("/developer/api-keys/:id", authorize("admin", "owner"), async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`UPDATE api_keys SET is_active = false, updated_at = NOW() WHERE id = ${id}`);
  void logAudit(req, "revoke", "api_keys", id, {});
  res.status(204).send();
});

/* ── Toggle active ── */
router.patch("/developer/api-keys/:id", authorize("admin", "owner"), async (req, res) => {
  const id = Number(req.params.id);
  const { isActive } = req.body as { isActive?: boolean };
  if (isActive === undefined) { res.status(400).json({ error: "isActive required" }); return; }
  await db.execute(sql`UPDATE api_keys SET is_active = ${isActive}, updated_at = NOW() WHERE id = ${id}`);
  res.json({ id, isActive });
});

export default router;
