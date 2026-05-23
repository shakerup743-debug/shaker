import { Router } from "express";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable, securityEventsTable } from "@workspace/db";
import { eq, and, gte, count, or } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { authenticate } from "../middleware/authenticate.js";
import { logAudit } from "../lib/audit.js";
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

router.post("/auth/logout", authenticate, async (req, res): Promise<void> => {
  // Mark session as revoked if sessionId is in JWT
  const payload = req.user as { sub: string; sessionId?: number };
  if (payload?.sessionId) {
    void db
      .update(userSessionsTable)
      .set({ revoked: true })
      .where(eq(userSessionsTable.id, payload.sessionId));
  }
  void logAudit(req, "logout", "auth", req.user?.sub, { email: req.user?.email });
  res.status(204).end();
});

router.get("/auth/me", authenticate, (req, res): void => {
  res.json({ user: req.user });
});

router.post("/auth/refresh", authenticate, async (req, res): Promise<void> => {
  const userPayload = req.user!;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parseInt(userPayload.sub, 10)));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  const ua = getUa(req);
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;

  // Revoke the old session (if the current JWT carried a sessionId)
  const oldSessionId = userPayload.sessionId;
  if (oldSessionId) {
    await db
      .update(userSessionsTable)
      .set({ revoked: true })
      .where(eq(userSessionsTable.id, oldSessionId));
  }

  // Create a fresh session row for the new token
  const newSessionId = await recordSession({
    tenantId: user.tenantId ?? null,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    ip,
    ua,
    isSuccess: true,
    mfaVerified: false, // refresh does not re-verify MFA
  });

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId ?? undefined,
    sessionId: newSessionId,
  });

  // Store hash so the session can be revoked
  await db
    .update(userSessionsTable)
    .set({ sessionTokenHash: sha256(token) })
    .where(eq(userSessionsTable.id, newSessionId));

  void logAudit(req, "token_refresh", "auth", String(user.id), {
    email: user.email,
    role: user.role,
    newSessionId,
    oldSessionId: oldSessionId ?? null,
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

export default router;
