import { Router } from "express";
import bcrypt from "bcryptjs";
import { masterPasswordsTable, protectedOperationsTable, protectedOperationLogsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireTenant } from "../middleware/require-tenant.js";
import { authorize } from "../middleware/authorize.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(requireTenant);

// ── Master Password Status ────────────────────────────────────────────────────
router.get("/security/master-password/status", authorize("admin", "owner", "platform_admin"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const [mp] = await req.db!
    .select({
      id: masterPasswordsTable.id,
      createdAt: masterPasswordsTable.createdAt,
      lastChangedAt: masterPasswordsTable.lastChangedAt,
      lastUsedAt: masterPasswordsTable.lastUsedAt,
      usageCount: masterPasswordsTable.usageCount,
    })
    .from(masterPasswordsTable)
    .where(eq(masterPasswordsTable.tenantId, tid));
  res.json({ exists: !!mp, ...(mp ?? {}) });
});

// ── Create Master Password ────────────────────────────────────────────────────
router.post("/security/master-password/create", authorize("admin", "owner", "platform_admin"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);
  const { password } = req.body as { password?: string };

  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [existing] = await req.db!
    .select({ id: masterPasswordsTable.id })
    .from(masterPasswordsTable)
    .where(eq(masterPasswordsTable.tenantId, tid));
  if (existing) {
    res.status(409).json({ error: "Master password already exists. Use PATCH /change to update it." });
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const backupCodes = Array.from({ length: 8 }, () =>
    Math.random().toString(36).substring(2, 6).toUpperCase() +
    "-" +
    Math.random().toString(36).substring(2, 6).toUpperCase()
  );

  await req.db!.insert(masterPasswordsTable).values({
    tenantId: tid,
    passwordHash: hash,
    createdBy: uid,
    backupCodes,
    backupCodesUsed: Array(8).fill(false) as boolean[],
  });

  void logAudit(req, "master_password_created", "master_passwords", 0, { tenantId: tid });
  res.status(201).json({ ok: true, backupCodes });
});

// ── Change Master Password ────────────────────────────────────────────────────
router.patch("/security/master-password/change", authorize("admin", "owner", "platform_admin"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Both current and new password required (min 8 chars)" });
    return;
  }

  const [mp] = await req.db!
    .select()
    .from(masterPasswordsTable)
    .where(eq(masterPasswordsTable.tenantId, tid));
  if (!mp) {
    res.status(404).json({ error: "Master password not set. Use POST /create first." });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, mp.passwordHash);
  if (!valid) {
    void logAudit(req, "master_password_change_failed", "master_passwords", 0, { tenantId: tid });
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await req.db!
    .update(masterPasswordsTable)
    .set({ passwordHash: newHash, lastChangedAt: new Date(), changedBy: uid })
    .where(eq(masterPasswordsTable.tenantId, tid));

  void logAudit(req, "master_password_changed", "master_passwords", 0, { tenantId: tid });
  res.json({ ok: true });
});

// ── Verify Master Password (before sensitive operation) ───────────────────────
router.post("/security/verify-master-password", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);
  const { password, operationKey, reason, amount } = req.body as {
    password?: string;
    operationKey?: string;
    reason?: string;
    amount?: number;
  };

  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }

  const [mp] = await req.db!
    .select()
    .from(masterPasswordsTable)
    .where(eq(masterPasswordsTable.tenantId, tid));
  if (!mp) {
    res.status(404).json({ error: "Master password not configured for this tenant" });
    return;
  }

  const valid = await bcrypt.compare(password!, mp.passwordHash);

  await req.db!.insert(protectedOperationLogsTable).values({
    tenantId: tid,
    operationKey: operationKey ?? "unknown",
    userId: uid,
    passwordVerified: valid,
    ipAddress: (req.ip ?? "").substring(0, 45),
    result: valid ? "success" : "failed",
    errorMessage: valid ? null : "Invalid master password",
  });

  if (valid) {
    await req.db!
      .update(masterPasswordsTable)
      .set({
        lastUsedAt: new Date(),
        usageCount: mp.usageCount + 1,
        lastUsedById: uid,
        lastUsedFor: reason ?? operationKey ?? null,
        lastUsedAmount: amount != null ? String(amount) : null,
      })
      .where(eq(masterPasswordsTable.tenantId, tid));
    void logAudit(req, "master_password_verified", "master_passwords", 0, {
      operationKey,
      reason,
      amount,
      userId: uid,
    });
    res.json({ ok: true });
  } else {
    void logAudit(req, "master_password_verify_failed", "master_passwords", 0, {
      operationKey,
      reason,
      userId: uid,
      ipAddress: req.ip,
    });
    res.status(401).json({ error: "Invalid master password" });
  }
});

// ── List Protected Operations ─────────────────────────────────────────────────
router.get("/security/operations", authorize("admin", "owner", "platform_admin"), async (req, res): Promise<void> => {
  const ops = await req.db!
    .select()
    .from(protectedOperationsTable)
    .orderBy(protectedOperationsTable.riskLevel, protectedOperationsTable.operationKey);
  res.json(ops);
});

// ── Toggle Operation Gate ─────────────────────────────────────────────────────
router.patch("/security/operations/:key", authorize("admin", "owner", "platform_admin"), async (req, res): Promise<void> => {
  const key = req.params.key as string;
  const { requiresPassword, isEnabled } = req.body as { requiresPassword?: boolean; isEnabled?: boolean };

  const update: Record<string, unknown> = {};
  if (requiresPassword !== undefined) update.requiresPassword = requiresPassword;
  if (isEnabled !== undefined) update.isEnabled = isEnabled;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [op] = await req.db!
    .update(protectedOperationsTable)
    .set(update as Partial<typeof protectedOperationsTable.$inferInsert>)
    .where(eq(protectedOperationsTable.operationKey, key))
    .returning();

  if (!op) {
    res.status(404).json({ error: "Operation not found" });
    return;
  }

  void logAudit(req, "operation_gate_updated", "protected_operations", op.id, { key, ...update });
  res.json(op);
});

// ── Operation Logs ────────────────────────────────────────────────────────────
router.get("/security/operations/logs", authorize("admin", "owner", "platform_admin"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50"), 200);

  const logs = await req.db!
    .select()
    .from(protectedOperationLogsTable)
    .where(eq(protectedOperationLogsTable.tenantId, tid))
    .orderBy(desc(protectedOperationLogsTable.timestamp))
    .limit(limit);

  res.json(logs);
});

export default router;
