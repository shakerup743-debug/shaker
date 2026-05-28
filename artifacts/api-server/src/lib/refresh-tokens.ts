// Refresh-token mechanics for persistent login.
//
// Design:
//   • Access token   — short-lived JWT (7d), issued via signToken() as today.
//   • Refresh token  — opaque 64-byte random hex, lives 30d, stored in:
//        a) HttpOnly + SameSite=Lax (+Secure in prod) cookie on the client
//        b) sha256-hashed row in `refresh_tokens` table
//
// Rotation: every /auth/refresh issues a new refresh token, marks the old row
// as revoked and `replaced_by_id`. Reusing an already-replaced token triggers
// chain revocation (theft mitigation).

import crypto from "crypto";
import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { refreshTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const REFRESH_COOKIE_NAME = "foodoro_rt";
export const REFRESH_TTL_DAYS = 30;
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

export function sha256(val: string): string {
  return crypto.createHash("sha256").update(val).digest("hex");
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Generate an opaque refresh token, persist its hash, and set the cookie.
 * Returns the row id so callers can update it later.
 */
export async function issueRefreshToken(opts: {
  res: Response;
  userId: number;
  tenantId: number | null;
  ip: string | null;
  ua: string | null;
}): Promise<{ tokenId: number; raw: string }> {
  const raw = crypto.randomBytes(48).toString("hex"); // 96 hex chars
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const [row] = await db
    .insert(refreshTokensTable)
    .values({
      userId:    opts.userId,
      tenantId:  opts.tenantId,
      tokenHash: sha256(raw),
      expiresAt,
      ipAddress: opts.ip,
      userAgent: opts.ua?.slice(0, 500) ?? null,
    })
    .returning({ id: refreshTokensTable.id });

  // Cookie. NB: SameSite=Lax lets us survive top-level navigations (closing &
  // reopening the browser); Secure is required for SameSite=None but we don't
  // need cross-site, so Lax + Secure-in-prod is the right combo.
  opts.res.cookie(REFRESH_COOKIE_NAME, raw, {
    httpOnly: true,
    secure:   isProd(),
    sameSite: "lax",
    path:     "/api/auth",   // sent only on auth routes
    maxAge:   REFRESH_TTL_MS,
  });

  return { tokenId: row!.id, raw };
}

/**
 * Clear the cookie on logout / 401-from-refresh.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
}

/**
 * Read the refresh token from the cookie (or body fallback for clients that
 * can't store cookies, e.g. some mobile in-app browsers).
 */
export function readRefreshToken(req: Request): string | null {
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE_NAME];
  if (fromCookie) return fromCookie;
  const body = (req.body ?? {}) as { refreshToken?: unknown };
  return typeof body.refreshToken === "string" ? body.refreshToken : null;
}

/**
 * Verify the raw token against the DB.
 * Returns the row when valid (not expired, not revoked).
 * Triggers chain revocation if a replaced-already token is reused.
 */
export async function verifyAndConsumeRefreshToken(raw: string): Promise<
  | { ok: true; row: { id: number; userId: number; tenantId: number | null } }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "reused" }
> {
  const hash = sha256(raw);
  const rows = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, hash));
  const row = rows[0];

  if (!row) return { ok: false, reason: "not_found" };

  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Reuse detection: a row marked replaced_by_id means it was already rotated.
  // If the client presents it again, that's either lag or theft — we revoke
  // the entire chain (current + descendant) defensively.
  if (row.replacedById) {
    await revokeChainStartingAt(row.id);
    return { ok: false, reason: "reused" };
  }

  if (row.revoked) {
    return { ok: false, reason: "revoked" };
  }

  return { ok: true, row: { id: row.id, userId: row.userId, tenantId: row.tenantId } };
}

/**
 * Mark the given row as revoked and follow replaced_by_id pointers to revoke
 * descendants too. Best-effort; runs in a small bounded loop.
 */
export async function revokeChainStartingAt(rowId: number): Promise<void> {
  let current: number | null = rowId;
  let safety = 50;
  while (current !== null && safety-- > 0) {
    const [updated] = await db
      .update(refreshTokensTable)
      .set({ revoked: true })
      .where(eq(refreshTokensTable.id, current))
      .returning({ next: refreshTokensTable.replacedById });
    current = updated?.next ?? null;
  }
}

/** Revoke every active refresh token for a user (used by logout-all). */
export async function revokeAllForUser(userId: number): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revoked: true })
    .where(eq(refreshTokensTable.userId, userId));
}

/** Mark row as rotated → revoked + pointer to the new row. */
export async function markReplaced(oldId: number, newId: number): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revoked: true, replacedById: newId, lastUsedAt: new Date() })
    .where(eq(refreshTokensTable.id, oldId));
}
