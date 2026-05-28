import { Router } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import { usersTable, userSessionsTable, securityEventsTable } from "@workspace/db";
import { eq, and, gte, count, or, sql } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middleware/authenticate.js";
import { logAudit } from "../lib/audit.js";
import {
  issueRefreshToken,
  readRefreshToken,
  verifyAndConsumeRefreshToken,
  markReplaced,
  clearRefreshCookie,
  revokeAllForUser,
} from "../lib/refresh-tokens.js";
import * as OTPAuth from "otpauth";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function sha256(val: string): string {
  return createHash("sha256").update(val).digest("hex");
}

function getUa(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : null;
}

// Use IP /24 prefix (first 3 octets) to group devices on same subnet,
// consistent with privacy-preserving fingerprint approach
function ipPrefix(ip: string | undefined): string {
  if (!ip) return "";
  const parts = ip.split(".");
  return parts.length >= 3 ? parts.slice(0, 3).join(".") : ip.split(":").slice(0, 4).join(":");
}

function parseDeviceFingerprint(ip: string | undefined, ua: string | null): string {
  return sha256(`${ipPrefix(ip)}:${ua ?? ""}`).slice(0, 16);
}

function parseDeviceInfo(ua: string | null): string {
  if (!ua) return "Unknown Device";
  if (/Mobile|Android|iPhone/i.test(ua)) return "Mobile";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac OS/i.test(ua)) return "Mac";
  return "Desktop";
}

async function recordSession(opts: {
  tenantId: number | null;
  userId: number;
  userName: string;
  userRole: string;
  ip: string | null;
  ua: string | null;
  isSuccess: boolean;
  mfaVerified: boolean;
  tokenHash?: string;
}): Promise<number> {
  const [row] = await db.insert(userSessionsTable).values({
    tenantId: opts.tenantId,
    userId: opts.userId,
    userName: opts.userName,
    userRole: opts.userRole,
    ipAddress: opts.ip,
    userAgent: opts.ua,
    deviceFingerprint: parseDeviceFingerprint(opts.ip ?? undefined, opts.ua),
    isSuccess: opts.isSuccess,
    sessionTokenHash: opts.tokenHash ?? null,
    mfaVerified: opts.mfaVerified,
    revoked: false,
  }).returning({ id: userSessionsTable.id });
  return row.id;
}

async function recordSecurityEvent(opts: {
  tenantId: number | null;
  type: string;
  ip: string | null;
  userId?: number | null;
  userName?: string | null;
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}): Promise<void> {
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
}

// Brute-force thresholds
//   PRIMARY  : per (email + ip) → blocks a specific attacker hammering one account
//   SECONDARY: per ip alone     → DoS defense against IP-wide credential stuffing
// Both must stay unresolved within the 15-min window to count.
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_IP_FAIL_THRESHOLD = 5;   // block on the 6th attempt for this email+ip combo
const IP_ONLY_FAIL_THRESHOLD  = 50;  // block when a single IP has 50 failures across ANY emails

// Count UNRESOLVED login_failed events scoped to (email, ip) within window.
// Resolved=true events are excluded so a prior successful login clears the lock.
async function countLoginFailuresByEmailAndIp(email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const [row] = await db
    .select({ cnt: count() })
    .from(securityEventsTable)
    .where(
      and(
        eq(securityEventsTable.ipAddress, ip),
        eq(securityEventsTable.userName, email),
        eq(securityEventsTable.type, "login_failed"),
        eq(securityEventsTable.resolved, false),
        gte(securityEventsTable.createdAt, since),
      ),
    );
  return Number(row?.cnt ?? 0);
}

// Count UNRESOLVED login_failed events for a single IP across ANY emails within window.
// Acts as a DoS / credential-stuffing layer at a much higher threshold.
async function countLoginFailuresByIp(ip: string): Promise<number> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const [row] = await db
    .select({ cnt: count() })
    .from(securityEventsTable)
    .where(
      and(
        eq(securityEventsTable.ipAddress, ip),
        eq(securityEventsTable.type, "login_failed"),
        eq(securityEventsTable.resolved, false),
        gte(securityEventsTable.createdAt, since),
      ),
    );
  return Number(row?.cnt ?? 0);
}

// Resolve previous login_failed events for this email so they no longer count
// toward future lockouts. Called on every successful login (including MFA pass).
async function clearLoginFailuresForEmail(email: string, ip: string | null): Promise<void> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  await db
    .update(securityEventsTable)
    .set({ resolved: true })
    .where(
      and(
        eq(securityEventsTable.userName, email),
        eq(securityEventsTable.type, "login_failed"),
        eq(securityEventsTable.resolved, false),
        gte(securityEventsTable.createdAt, since),
        // Also clear failures from the same IP across different emails (typo cases)
        ip ? or(eq(securityEventsTable.ipAddress, ip), eq(securityEventsTable.userName, email))
           : eq(securityEventsTable.userName, email),
      ),
    );
}

// Check if a brute_force event was already emitted in the current window for this scope.
// Prevents flooding the event log with duplicate brute_force events.
async function hasBruteForceEventInWindow(opts: {
  ip: string;
  email?: string;
  scope: "email_ip" | "ip_only";
}): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const conds = [
    eq(securityEventsTable.ipAddress, opts.ip),
    eq(securityEventsTable.type, "brute_force"),
    gte(securityEventsTable.createdAt, since),
  ];
  if (opts.scope === "email_ip" && opts.email) {
    conds.push(eq(securityEventsTable.userName, opts.email));
  }
  const [row] = await db
    .select({ cnt: count() })
    .from(securityEventsTable)
    .where(and(...conds));
  return Number(row?.cnt ?? 0) > 0;
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password, mfa_token } = req.body as {
    email?: string;
    password?: string;
    mfa_token?: string;
  };

  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  const ua = getUa(req);

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // ── Brute-force gate ──────────────────────────────────────────────────────
  // Block at 6+ failed attempts for THIS email from THIS ip (primary lock).
  // Also block at 50+ failures from this ip across ANY email (DoS layer).
  // Failures cleared on the next successful login for that email, so legitimate
  // users on shared IPs never get permanently locked out by other users' typos.
  if (ip) {
    const [emailIpFails, ipFails] = await Promise.all([
      countLoginFailuresByEmailAndIp(normalizedEmail, ip),
      countLoginFailuresByIp(ip),
    ]);

    const emailIpBlocked = emailIpFails >= EMAIL_IP_FAIL_THRESHOLD;
    const ipBlocked      = ipFails      >= IP_ONLY_FAIL_THRESHOLD;

    if (emailIpBlocked || ipBlocked) {
      const scope: "email_ip" | "ip_only" = emailIpBlocked ? "email_ip" : "ip_only";

      void recordSession({
        tenantId: null,
        userId: 0,
        userName: normalizedEmail,
        userRole: "unknown",
        ip,
        ua,
        isSuccess: false,
        mfaVerified: false,
      });
      void recordSecurityEvent({
        tenantId: null,
        type: "login_failed",
        ip,
        userName: normalizedEmail,
        severity: "low",
        metadata: { reason: "brute_force_blocked", email: normalizedEmail, scope },
      });

      const alreadyEmitted = await hasBruteForceEventInWindow({ ip, email: normalizedEmail, scope });
      if (!alreadyEmitted) {
        void recordSecurityEvent({
          tenantId: null,
          type: "brute_force",
          ip,
          userName: normalizedEmail,
          severity: "high",
          metadata: {
            scope,
            emailIpFailures: emailIpFails,
            ipFailures: ipFails,
            email: normalizedEmail,
          },
        });
      }

      res.status(429).set("Retry-After", "900").json({
        error:
          scope === "email_ip"
            ? "Too many failed attempts for this account. Try again in 15 minutes or reset your password."
            : "Too many failed login attempts from your network. Try again in 15 minutes.",
        scope,
      });
      return;
    }
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (!user || !user.isActive) {
    // Record failure
    void recordSession({
      tenantId: null,
      userId: user?.id ?? 0,
      userName: normalizedEmail,
      userRole: "unknown",
      ip,
      ua,
      isSuccess: false,
      mfaVerified: false,
    });
    void recordSecurityEvent({
      tenantId: null,
      type: "login_failed",
      ip,
      userId: user?.id ?? null,
      userName: normalizedEmail,
      severity: "low",
      metadata: { reason: "user_not_found_or_inactive", email: normalizedEmail },
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    void recordSession({
      tenantId: user.tenantId ?? null,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      ip,
      ua,
      isSuccess: false,
      mfaVerified: false,
    });
    void recordSecurityEvent({
      tenantId: user.tenantId ?? null,
      type: "login_failed",
      ip,
      userId: user.id,
      userName: normalizedEmail,
      severity: "low",
      metadata: { reason: "wrong_password", email: normalizedEmail },
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.tenantId) {
    // Record the failure — account exists but has no tenant assignment
    void recordSession({
      tenantId: null,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      ip,
      ua,
      isSuccess: false,
      mfaVerified: false,
    });
    void recordSecurityEvent({
      tenantId: null,
      type: "login_failed",
      ip,
      userId: user.id,
      userName: user.name,
      severity: "medium",
      metadata: { reason: "no_tenant_assignment", email },
    });
    res.status(401).json({ error: "Account not assigned to any tenant. Contact your administrator." });
    return;
  }

  // MFA check
  let mfaVerified = false;
  if (user.mfaEnabled && user.mfaSecret) {
    if (!mfa_token) {
      // Record failure for missing MFA token
      void recordSession({
        tenantId: user.tenantId ?? null,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        ip,
        ua,
        isSuccess: false,
        mfaVerified: false,
      });
      void recordSecurityEvent({
        tenantId: user.tenantId ?? null,
        type: "mfa_failed",
        ip,
        userId: user.id,
        userName: user.name,
        severity: "medium",
        metadata: { reason: "mfa_token_missing", email },
      });
      res.status(401).json({ error: "MFA token required", requiresMfa: true });
      return;
    }
    const totp = new OTPAuth.TOTP({
      issuer: "FOODORO",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
    });
    const delta = totp.validate({ token: mfa_token, window: 1 });
    if (delta === null) {
      void recordSecurityEvent({
        tenantId: user.tenantId,
        type: "mfa_failed",
        ip,
        userId: user.id,
        userName: user.name,
        severity: "medium",
        metadata: { email },
      });
      void recordSession({
        tenantId: user.tenantId ?? null,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        ip,
        ua,
        isSuccess: false,
        mfaVerified: false,
      });
      res.status(401).json({ error: "Invalid MFA token", requiresMfa: true });
      return;
    }
    mfaVerified = true;
  }

  // Clear previous failures for this email+ip so the brute-force counter resets
  void clearLoginFailuresForEmail(user.email, ip);

  // Record success session first to get session id
  const sessionId = await recordSession({
    tenantId: user.tenantId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    ip,
    ua,
    isSuccess: true,
    mfaVerified,
    tokenHash: undefined, // will be updated after signing
  });

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    sessionId,
  });

  // Store token hash so it can be revoked
  const tokenHash = sha256(token);
  await db
    .update(userSessionsTable)
    .set({ sessionTokenHash: tokenHash })
    .where(eq(userSessionsTable.id, sessionId));

  // Update last login
  void db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  // Emit login_success security event — used by Security Center overview chart
  void recordSecurityEvent({
    tenantId: user.tenantId ?? null,
    type: "login_success",
    ip,
    userId: user.id,
    userName: user.name,
    severity: "low",
    metadata: { device: parseDeviceInfo(ua), mfaVerified },
  });

  void logAudit(
    req,
    "login",
    "auth",
    String(user.id),
    { email: user.email, role: user.role, sessionId, device: parseDeviceInfo(ua) },
    { userId: user.id, userName: user.name },
  );

  // Persistent login: issue an HttpOnly refresh-token cookie (30d).
  // The access token still flows as JSON for client-side use.
  await issueRefreshToken({ res, userId: user.id, tenantId: user.tenantId, ip, ua });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// Logout works even if the access token already expired — we read the
// refresh cookie directly to revoke the chain. This makes "logout from
// stale tab" reliable and prevents zombie refresh tokens.
router.post("/auth/logout", async (req, res): Promise<void> => {
  // Best-effort revoke of the access-token session if a Bearer was sent
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { verifyToken } = await import("../lib/jwt.js");
      const payload = await verifyToken(authHeader.slice(7));
      if (payload?.sessionId) {
        void db
          .update(userSessionsTable)
          .set({ revoked: true })
          .where(eq(userSessionsTable.id, payload.sessionId));
      }
    } catch { /* expired/invalid token is fine — cookie path covers it */ }
  }

  // Revoke the refresh-token chain associated with this cookie and clear it
  const raw = readRefreshToken(req);
  if (raw) {
    const v = await verifyAndConsumeRefreshToken(raw);
    if (v.ok) await revokeAllForUser(v.row.userId);
  }
  clearRefreshCookie(res);

  void logAudit(req, "logout", "auth", req.user?.sub ?? null, { email: req.user?.email });
  res.status(204).end();
});

router.get("/auth/me", authenticate, (req, res): void => {
  res.json({ user: req.user });
});

// NOTE: refresh deliberately does NOT use `authenticate`. The whole point of
// a refresh token is to mint a new access token AFTER the old one expired.
router.post("/auth/refresh", async (req, res): Promise<void> => {
  const raw = readRefreshToken(req);
  if (!raw) {
    res.status(401).json({ error: "No refresh token", code: "NO_REFRESH" });
    return;
  }

  const verified = await verifyAndConsumeRefreshToken(raw);
  if (!verified.ok) {
    // Any failure clears the cookie so the client doesn't get stuck in a loop.
    clearRefreshCookie(res);
    if (verified.reason === "reused") {
      void recordSecurityEvent({
        tenantId: null,
        type: "refresh_token_reuse",
        ip: req.ip ?? null,
        severity: "high",
        metadata: { hint: "possible token theft — chain revoked" },
      });
    }
    res.status(401).json({ error: "Refresh failed", code: verified.reason.toUpperCase() });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, verified.row.userId));

  if (!user || !user.isActive) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "User not found or inactive", code: "USER_INVALID" });
    return;
  }

  const ua = getUa(req);
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;

  // Old session row (if present in payload) is purely informational —
  // we always create a fresh session row for traceability.
  const newSessionId = await recordSession({
    tenantId: user.tenantId ?? null,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    ip,
    ua,
    isSuccess: true,
    mfaVerified: false,
  });

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId ?? undefined,
    sessionId: newSessionId,
  });

  await db
    .update(userSessionsTable)
    .set({ sessionTokenHash: sha256(token) })
    .where(eq(userSessionsTable.id, newSessionId));

  // Rotate the refresh token: issue a new one and mark the old as replaced.
  const fresh = await issueRefreshToken({ res, userId: user.id, tenantId: user.tenantId ?? null, ip, ua });
  await markReplaced(verified.row.id, fresh.tokenId);

  void logAudit(req, "token_refresh", "auth", String(user.id), {
    email: user.email,
    role: user.role,
    newSessionId,
    oldRefreshId: verified.row.id,
    newRefreshId: fresh.tokenId,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  PIN-FIRST LOGIN  (Role + Name + 6-digit PIN)
//  ┌── Tenant context for these public endpoints comes from the URL `tenantId`
//  │   query param OR the subdomain (resolveTenant style). Here we accept it
//  │   as a body param since the user is not yet authenticated.
//  ├── POST /api/auth/roster        — list active staff grouped by role
//  └── POST /api/auth/pin-login     — { tenantId, userId, pin } -> JWT
// ─────────────────────────────────────────────────────────────────────────────

// Public: list workers grouped by role. No emails leaked. Used by the
// shift-attendant kiosk to pick "who am I" before entering the PIN.
router.post("/auth/roster", async (req, res): Promise<void> => {
  const { tenantId } = (req.body ?? {}) as { tenantId?: number };
  if (!tenantId || typeof tenantId !== "number") {
    res.status(400).json({ error: "tenantId required" });
    return;
  }
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      shiftStartsAt: usersTable.shiftStartsAt,
      shiftEndsAt:   usersTable.shiftEndsAt,
      pinDisabledAt: usersTable.pinDisabledAt,
      hasPin: sql<boolean>`${usersTable.pin} IS NOT NULL`,
    })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.isActive, true)));

  const now = Date.now();
  const byRole: Record<string, Array<{ id: number; name: string; available: boolean; reason?: string }>> = {};
  for (const u of rows) {
    if (!u.hasPin) continue; // no PIN set → cannot log in via PIN
    let available = true;
    let reason: string | undefined;
    if (u.pinDisabledAt) { available = false; reason = "pin_disabled"; }
    else if (u.shiftStartsAt && new Date(u.shiftStartsAt).getTime() > now) {
      available = false; reason = "shift_not_started";
    } else if (u.shiftEndsAt && new Date(u.shiftEndsAt).getTime() < now) {
      available = false; reason = "shift_ended";
    }
    if (!byRole[u.role]) byRole[u.role] = [];
    byRole[u.role].push({ id: u.id, name: u.name, available, reason });
  }
  res.json(byRole);
});

router.post("/auth/pin-login", async (req, res): Promise<void> => {
  const { tenantId, userId, pin } = (req.body ?? {}) as { tenantId?: number; userId?: number; pin?: string };
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  const ua = getUa(req);
  if (!tenantId || !userId || !pin) {
    res.status(400).json({ error: "tenantId, userId, pin required" });
    return;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be 4-8 digits" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId), eq(usersTable.isActive, true)));

  const failAndLog = async (reason: string, status: number, msg: string) => {
    void recordSecurityEvent({
      tenantId, type: "login_failed", ip, userId: user?.id ?? null, userName: user?.name ?? `userId:${userId}`,
      severity: "low", metadata: { reason, channel: "pin" },
    });
    res.status(status).json({ error: msg });
  };

  if (!user || !user.pin) { await failAndLog("user_not_found_or_no_pin", 401, "بيانات الدخول غير صحيحة"); return; }
  if (user.pinDisabledAt)  { await failAndLog("pin_disabled", 403, "تم تعطيل PIN الخاص بك. تواصل مع المدير."); return; }

  const now = Date.now();
  if (user.shiftStartsAt && new Date(user.shiftStartsAt).getTime() > now) {
    await failAndLog("shift_not_started", 403, "وقت دوامك لم يبدأ بعد"); return;
  }
  if (user.shiftEndsAt && new Date(user.shiftEndsAt).getTime() < now) {
    await failAndLog("shift_ended", 403, "انتهى وقت دوامك"); return;
  }

  const valid = await bcrypt.compare(pin, user.pin);
  if (!valid) { await failAndLog("wrong_pin", 401, "PIN غير صحيح"); return; }

  if (!user.tenantId) {
    await failAndLog("no_tenant", 401, "الحساب غير مرتبط بفرع"); return;
  }

  // Success path — issue normal JWT identical to /auth/login output
  const sessionId = await recordSession({
    tenantId: user.tenantId, userId: user.id, userName: user.name,
    userRole: user.role, ip, ua, isSuccess: true, mfaVerified: false,
  });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  void recordSecurityEvent({
    tenantId: user.tenantId, type: "login_success", ip, userId: user.id, userName: user.name,
    severity: "low", metadata: { channel: "pin", role: user.role },
  });

  const token = await signToken({
    sub: String(user.id), email: user.email, name: user.name,
    role: user.role, tenantId: user.tenantId, sessionId,
  });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  MASTER-PASSWORD  SESSION TOKENS  (15-min TTL each, guards Admin/Tools)
//  POST /api/master-password/session/start  { masterPassword } -> { token, expiresAt }
//  POST /api/master-password/session/check  Header: X-Master-Session: <token>
//  POST /api/master-password/session/end    Header: X-Master-Session: <token>
//  All actions write to `security_events`.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";

const MASTER_SESSION_TTL_MS = 15 * 60 * 1000;

router.post("/master-password/session/start", authenticate, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "auth required" }); return; }
  const tid = req.user.tenantId!;
  const uid = parseInt(req.user.sub, 10);
  const { masterPassword } = (req.body ?? {}) as { masterPassword?: string };
  if (!masterPassword) { res.status(400).json({ error: "masterPassword required" }); return; }

  // Verify against the existing master_passwords table.
  const r = await db.execute(sql`SELECT password_hash FROM master_passwords WHERE tenant_id = ${tid} LIMIT 1`);
  const row = r.rows[0] as { password_hash: string } | undefined;
  const ok = !!row && (await bcrypt.compare(masterPassword, row.password_hash));

  void recordSecurityEvent({
    tenantId: tid, type: ok ? "master_pw_unlock" : "master_pw_failed",
    ip: req.ip ?? null, userId: uid, userName: req.user.name,
    severity: ok ? "low" : "high",
    metadata: { route: "session_start" },
  });

  if (!ok) { res.status(401).json({ error: "كلمة المرور الرئيسية خاطئة" }); return; }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + MASTER_SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO master_pw_sessions (tenant_id, user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tid, uid, token, expires, req.ip ?? null, getUa(req)],
  );
  res.json({ token, expiresAt: expires.toISOString() });
});

router.post("/master-password/session/check", authenticate, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "auth required" }); return; }
  const token = req.headers["x-master-session"] as string | undefined;
  if (!token) { res.status(401).json({ error: "no master session", code: "MASTER_REQUIRED" }); return; }
  const r = await pool.query(
    `SELECT expires_at FROM master_pw_sessions
     WHERE token = $1 AND user_id = $2 AND tenant_id = $3 AND NOT revoked
     LIMIT 1`,
    [token, parseInt(req.user.sub, 10), req.user.tenantId],
  );
  if (!r.rowCount) { res.status(401).json({ error: "invalid", code: "MASTER_REQUIRED" }); return; }
  if (new Date(r.rows[0].expires_at).getTime() < Date.now()) {
    res.status(401).json({ error: "expired", code: "MASTER_EXPIRED" });
    return;
  }
  res.json({ ok: true, expiresAt: r.rows[0].expires_at });
});

router.post("/master-password/session/end", authenticate, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "auth required" }); return; }
  const token = req.headers["x-master-session"] as string | undefined;
  if (!token) { res.json({ ok: true }); return; }
  await pool.query(`UPDATE master_pw_sessions SET revoked = true WHERE token = $1`, [token]);
  void recordSecurityEvent({
    tenantId: req.user.tenantId!, type: "master_pw_lock", ip: req.ip ?? null,
    userId: parseInt(req.user.sub, 10), userName: req.user.name,
    severity: "low", metadata: {},
  });
  res.json({ ok: true });
});

export default router;
