import { Router } from "express";
import { createHash } from "crypto";
import { db } from "@workspace/db";
import { userSessionsTable, securityEventsTable, usersTable } from "@workspace/db";
import { eq, and, desc, gte, count, SQL } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

async function emitSecurityEvent(opts: {
  tenantId: number | null;
  type: string;
  ip: string | null;
  userId?: number | null;
  userName?: string | null;
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(securityEventsTable).values({
      tenantId: opts.tenantId,
      type: opts.type,
      ipAddress: opts.ip,
      userId: opts.userId ?? null,
      userName: opts.userName ?? null,
      severity: opts.severity,
      metadata: opts.metadata ?? null,
      resolved: false,
    });
  } catch {
    // never throw from audit
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Sessions ───────────────────────────────────────────────────────────────

// GET /api/security/sessions
// - Admins/owners: see ALL sessions for their tenant (optional ?userId=N filter)
// - Regular users: see only their own sessions
// Returns ALL sessions (active, revoked, failed) with status badges for full visibility
router.get("/security/sessions", authenticate, async (req, res): Promise<void> => {
  const requestingUserId = parseInt(req.user!.sub, 10);
  const tenantId = req.user!.tenantId;
  const isAdmin = ["owner", "admin", "platform_admin"].includes(req.user!.role);

  const bearer = req.headers.authorization;
  let currentTokenHash: string | null = null;
  if (bearer?.startsWith("Bearer ")) {
    currentTokenHash = hashToken(bearer.slice(7));
  }

  const filters: SQL[] = [];

  if (isAdmin) {
    // Admins see all sessions in the tenant; optional filter by userId
    if (tenantId) filters.push(eq(userSessionsTable.tenantId, tenantId));

    if (req.query.userId) {
      const candidateId = parseInt(String(req.query.userId), 10);
      // Tenant-scope check: verify target user belongs to same tenant
      if (tenantId) {
        const [targetUser] = await db
          .select({ tenantId: usersTable.tenantId })
          .from(usersTable)
          .where(eq(usersTable.id, candidateId));
        if (!targetUser || targetUser.tenantId !== tenantId) {
          res.status(403).json({ error: "Forbidden: user is outside your tenant" });
          return;
        }
      }
      filters.push(eq(userSessionsTable.userId, candidateId));
    }
  } else {
    // Non-admins see only their own sessions
    filters.push(eq(userSessionsTable.userId, requestingUserId));
    if (tenantId) filters.push(eq(userSessionsTable.tenantId, tenantId));
  }

  const where = filters.length > 0 ? and(...(filters as [SQL, ...SQL[]])) : undefined;

  const sessions = await db
    .select()
    .from(userSessionsTable)
    .where(where)
    .orderBy(desc(userSessionsTable.createdAt))
    .limit(200);

  // Strip sessionTokenHash from response (internal hash, not needed by clients)
  res.json(sessions.map(({ sessionTokenHash: _hash, ...s }) => ({
    ...s,
    isCurrent: Boolean(_hash && _hash === currentTokenHash),
  })));
});

// DELETE /api/security/sessions/:id — revoke; admins can revoke any within tenant
router.delete("/security/sessions/:id", authenticate, async (req, res): Promise<void> => {
  const requestingUserId = parseInt(req.user!.sub, 10);
  const tenantId = req.user!.tenantId;
  const sessionId = parseInt(String(req.params.id), 10);
  const isAdmin = ["owner", "admin", "platform_admin"].includes(req.user!.role);

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(eq(userSessionsTable.id, sessionId));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Cross-tenant check: session must belong to same tenant as requester
  if (tenantId && session.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!isAdmin && session.userId !== requestingUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .update(userSessionsTable)
    .set({ revoked: true })
    .where(eq(userSessionsTable.id, sessionId));

  void emitSecurityEvent({
    tenantId: tenantId ?? null,
    type: "session_revoked",
    ip: req.ip ?? null,
    userId: requestingUserId,
    severity: "low",
    metadata: { sessionId, targetUserId: session.userId },
  });

  res.status(204).end();
});

// ── Security Events ────────────────────────────────────────────────────────

// GET /api/security/events — admin/owner only; filterable by type, severity, since
router.get(
  "/security/events",
  authenticate,
  authorize("admin", "owner", "platform_admin"),
  async (req, res): Promise<void> => {
    const tenantId = req.user!.tenantId;
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const severityFilter = req.query.severity ? String(req.query.severity) : null;
    const since = req.query.since ? new Date(String(req.query.since)) : null;

    const filters: SQL[] = [];
    if (tenantId) filters.push(eq(securityEventsTable.tenantId, tenantId));
    if (typeFilter) filters.push(eq(securityEventsTable.type, typeFilter));
    if (severityFilter) filters.push(eq(securityEventsTable.severity, severityFilter));
    if (since) filters.push(gte(securityEventsTable.createdAt, since));

    const where = filters.length > 0 ? and(...(filters as [SQL, ...SQL[]])) : undefined;

    const events = await db
      .select()
      .from(securityEventsTable)
      .where(where)
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(limit);

    res.json(events);
  },
);

// GET /api/security/events/summary — aggregate counts (admin/owner only)
router.get(
  "/security/events/summary",
  authenticate,
  authorize("admin", "owner", "platform_admin"),
  async (req, res): Promise<void> => {
    const tenantId = req.user!.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const evFilt = (extra: SQL): SQL =>
      tenantId ? and(eq(securityEventsTable.tenantId, tenantId), extra)! : extra;
    const sesFilt = (extra: SQL): SQL =>
      tenantId ? and(eq(userSessionsTable.tenantId, tenantId), extra)! : extra;
    const usrFilt = (extra: SQL): SQL =>
      tenantId ? and(eq(usersTable.tenantId, tenantId), extra)! : extra;

    const [
      eventsToday,
      bruteForceToday,
      failedLoginsToday,
      activeSessions,
      usersTotal,
      mfaEnabledCount,
    ] = await Promise.all([
      db.select({ cnt: count() }).from(securityEventsTable).where(evFilt(gte(securityEventsTable.createdAt, today))),
      db.select({ cnt: count() }).from(securityEventsTable).where(evFilt(and(eq(securityEventsTable.type, "brute_force"), gte(securityEventsTable.createdAt, today))!)),
      db.select({ cnt: count() }).from(userSessionsTable).where(sesFilt(and(eq(userSessionsTable.isSuccess, false), gte(userSessionsTable.createdAt, today))!)),
      db.select({ cnt: count() }).from(userSessionsTable).where(sesFilt(and(eq(userSessionsTable.isSuccess, true), eq(userSessionsTable.revoked, false))!)),
      db.select({ cnt: count() }).from(usersTable).where(usrFilt(eq(usersTable.isActive, true))),
      db.select({ cnt: count() }).from(usersTable).where(usrFilt(eq(usersTable.mfaEnabled, true))),
    ]);

    const totalUsers = Number(usersTotal[0]?.cnt ?? 0);
    const mfaCount = Number(mfaEnabledCount[0]?.cnt ?? 0);

    res.json({
      total_events_today: Number(eventsToday[0]?.cnt ?? 0),
      brute_force_today: Number(bruteForceToday[0]?.cnt ?? 0),
      failed_logins_today: Number(failedLoginsToday[0]?.cnt ?? 0),
      active_sessions: Number(activeSessions[0]?.cnt ?? 0),
      mfa_adoption_rate: totalUsers > 0 ? Math.round((mfaCount / totalUsers) * 100) : 0,
      mfa_enabled_count: mfaCount,
      total_users: totalUsers,
    });
  },
);

// ── MFA Setup ─────────────────────────────────────────────────────────────

router.post("/security/mfa/setup", authenticate, async (req, res): Promise<void> => {
  const userId = parseInt(req.user!.sub, 10);

  const [user] = await db
    .select({ email: usersTable.email, mfaEnabled: usersTable.mfaEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.mfaEnabled) {
    res.status(400).json({ error: "MFA already enabled" });
    return;
  }

  const randomSecret = new OTPAuth.Secret();
  const totp = new OTPAuth.TOTP({
    issuer: "FOODORO",
    label: user.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: randomSecret,
  });

  const secret = totp.secret.base32;
  const otpAuthUrl = totp.toString();

  // Generate QR code as data URL for easy scanning
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(otpAuthUrl, { width: 256, margin: 2 });
  } catch {
    // QR generation failure is non-fatal — manual entry still works
  }

  await db
    .update(usersTable)
    .set({ mfaSecretPending: secret })
    .where(eq(usersTable.id, userId));

  res.json({ secret, otpAuthUrl, qrDataUrl });
});

router.post("/security/mfa/verify", authenticate, async (req, res): Promise<void> => {
  const userId = parseInt(req.user!.sub, 10);
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "TOTP code required" });
    return;
  }

  const [user] = await db
    .select({ mfaSecretPending: usersTable.mfaSecretPending, mfaEnabled: usersTable.mfaEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user?.mfaSecretPending) {
    res.status(400).json({ error: "No pending MFA setup. Call /security/mfa/setup first." });
    return;
  }

  const totp = new OTPAuth.TOTP({
    issuer: "FOODORO",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.mfaSecretPending),
  });

  if (totp.validate({ token: code, window: 1 }) === null) {
    void emitSecurityEvent({
      tenantId: req.user!.tenantId, type: "mfa_failed", ip: req.ip ?? null, userId, severity: "medium",
    });
    res.status(400).json({ error: "Invalid TOTP code" });
    return;
  }

  await db
    .update(usersTable)
    .set({ mfaEnabled: true, mfaSecret: user.mfaSecretPending, mfaSecretPending: null })
    .where(eq(usersTable.id, userId));

  void emitSecurityEvent({
    tenantId: req.user!.tenantId, type: "mfa_enabled", ip: req.ip ?? null, userId, severity: "low",
  });

  res.json({ success: true });
});

// DELETE /api/security/mfa — disable MFA; admin can target another user in SAME tenant via ?userId=N
router.delete("/security/mfa", authenticate, async (req, res): Promise<void> => {
  const requestingUserId = parseInt(req.user!.sub, 10);
  const tenantId = req.user!.tenantId;
  const isAdmin = ["owner", "admin", "platform_admin"].includes(req.user!.role);
  const { code } = req.body as { code?: string };

  let targetUserId = requestingUserId;

  if (isAdmin && req.query.userId) {
    const candidateId = parseInt(String(req.query.userId), 10);
    // Cross-tenant guard: verify target user is in same tenant
    if (tenantId) {
      const [targetUser] = await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.id, candidateId));
      if (!targetUser || targetUser.tenantId !== tenantId) {
        res.status(403).json({ error: "Forbidden: user is outside your tenant" });
        return;
      }
    }
    targetUserId = candidateId;
  }

  const [user] = await db
    .select({ mfaSecret: usersTable.mfaSecret, mfaEnabled: usersTable.mfaEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId));

  if (!user?.mfaEnabled) {
    res.status(400).json({ error: "MFA is not enabled" });
    return;
  }

  // Own-account disable requires TOTP verification
  if (targetUserId === requestingUserId) {
    if (!code) {
      res.status(400).json({ error: "TOTP code required to disable MFA" });
      return;
    }
    if (user.mfaSecret) {
      const totp = new OTPAuth.TOTP({
        issuer: "FOODORO",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
      });
      if (totp.validate({ token: code, window: 1 }) === null) {
        void emitSecurityEvent({
          tenantId: tenantId ?? null, type: "mfa_failed", ip: req.ip ?? null, userId: requestingUserId, severity: "medium",
        });
        res.status(400).json({ error: "Invalid TOTP code" });
        return;
      }
    }
  }

  await db
    .update(usersTable)
    .set({ mfaEnabled: false, mfaSecret: null, mfaSecretPending: null })
    .where(eq(usersTable.id, targetUserId));

  void emitSecurityEvent({
    tenantId: tenantId ?? null, type: "mfa_disabled", ip: req.ip ?? null,
    userId: requestingUserId, severity: "medium", metadata: { targetUserId },
  });

  res.json({ success: true });
});

export default router;
