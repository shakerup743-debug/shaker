import { type Request, type Response, type NextFunction } from "express";
import pg from "pg";
import { db, pool, usersTable, createTenantDb } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
      db?: ReturnType<typeof createTenantDb>;
    }
  }
}

/**
 * Resolves the tenant for the authenticated user and sets up a per-request
 * DB connection with app.current_tenant_id so FORCE RLS policies are satisfied.
 *
 * Idempotent: if req.db is already set by a prior middleware call, returns
 * immediately without acquiring a second connection.
 *
 * Tenant resolution order:
 *  1. req.user.tenantId (JWT claim / Clerk session)
 *  2. DB lookup by clerk_id (Clerk sub, e.g. "user_xxx")
 *  3. DB lookup by numeric user id (mobile JWT)
 *
 * Returns 401 if unauthenticated, 403 if no tenant can be resolved.
 *
 * Connection management: uses session-level SET + RESET (not SET LOCAL in a
 * transaction) because several handlers call req.db!.transaction(), which
 * issues its own BEGIN/COMMIT on the same client.  The connection is held
 * exclusively for this request; releaseClient() resets the variable before
 * returning the client to the pool.
 */
export async function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Idempotent: already initialized (e.g. by a per-router call)
  if (req.db) { next(); return; }

  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let tenantId = req.user.tenantId ?? null;

  if (tenantId == null) {
    const sub = req.user.sub;
    const numericId = parseInt(sub, 10);
    if (!isNaN(numericId) && String(numericId) === sub) {
      const [user] = await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.id, numericId));
      tenantId = user?.tenantId ?? null;
    } else {
      const [user] = await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.clerkId, sub));
      tenantId = user?.tenantId ?? null;
    }
  }

  if (tenantId == null) {
    res.status(403).json({ error: "No tenant associated with this account. Contact your administrator." });
    return;
  }

  req.tenantId = tenantId;

  let client: pg.PoolClient | null = null;
  let released = false;

  const releaseClient = async () => {
    if (released) return;
    released = true;
    try {
      await (client as pg.PoolClient).query("RESET ROLE");
      await (client as pg.PoolClient).query("RESET app.current_tenant_id");
    } catch (_) {
      // ignore cleanup errors
    }
    (client as pg.PoolClient).release();
  };

  try {
    client = await pool.connect();
    // tenantId is a verified integer from the database — interpolation is safe.
    await client.query(`SET app.current_tenant_id = '${tenantId}'`);
    // Switch to limited-privilege role so RLS policies are enforced.
    // postgres (superuser) bypasses RLS; foodoro_app does not.
    await client.query(`SET ROLE foodoro_app`);
    req.db = createTenantDb(client);

    res.once("finish", () => void releaseClient());
    res.once("close", () => void releaseClient());

    next();
  } catch (err) {
    if (client && !released) {
      released = true;
      client.release();
    }
    req.log?.error(err, "requireTenant: failed to acquire tenant DB context");
    res.status(500).json({ error: "Internal server error" });
  }
}
