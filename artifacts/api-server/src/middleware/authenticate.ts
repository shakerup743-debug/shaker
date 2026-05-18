import { type Request, type Response, type NextFunction } from "express";
import { getAuth, createClerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;       // numeric DB user id as string
        email: string;
        name: string;
        role: string;
        tenantId: number | null;
        sessionId?: number; // present when issued via JWT login
      };
    }
  }
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function resolveLocalUser(clerkUserId: string) {
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId));

  if (user) return user;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) return null;

  const firstName = clerkUser.firstName ?? "";
  const lastName = clerkUser.lastName ?? "";
  const name = `${firstName} ${lastName}`.trim() || email.split("@")[0];

  [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (user) {
    await db
      .update(usersTable)
      .set({ clerkId: clerkUserId })
      .where(eq(usersTable.id, user.id));
    return { ...user, clerkId: clerkUserId };
  }

  // No matching DB user — auto-provision a new tenant + owner account.
  // Every new Clerk sign-up gets their own isolated tenant with full owner access.
  const slug = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30)
    + "-" + Math.random().toString(36).slice(2, 7);

  const [newTenant] = await db
    .insert(tenantsTable)
    .values({
      slug,
      name: name + "'s Restaurant",
      primaryColor: "#E67E22",
      currency: "SAR",
      taxRate: "15",
      country: "SA",
      timezone: "Asia/Riyadh",
      subscriptionPlan: "starter",
      subscriptionStatus: "trial",
      isActive: true,
    })
    .returning();

  const [newUser] = await db
    .insert(usersTable)
    .values({
      tenantId: newTenant!.id,
      name,
      email: email.toLowerCase(),
      password: "",
      role: "owner",
      clerkId: clerkUserId,
      isActive: true,
    })
    .returning();

  return newUser!;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let auth: { userId?: string | null } | null = null;
  try {
    auth = getAuth(req);
  } catch {
    auth = null;
  }

  if (!auth?.userId) {
    const bearer = req.headers.authorization;
    if (bearer?.startsWith("Bearer ")) {
      const { verifyToken } = await import("../lib/jwt.js");
      try {
        const payload = await verifyToken(bearer.slice(7));
        const p = payload as {
          sub: string;
          email: string;
          name: string;
          role: string;
          tenantId?: number;
          sessionId?: number;
        };

        // If JWT carries a sessionId, verify the session exists and is not revoked
        if (p.sessionId) {
          const [session] = await db
            .select({ revoked: userSessionsTable.revoked })
            .from(userSessionsTable)
            .where(eq(userSessionsTable.id, p.sessionId));
          if (!session || session.revoked) {
            res.status(401).json({ error: "Session has been revoked. Please sign in again." });
            return;
          }
        }

        req.user = {
          sub: p.sub,
          email: p.email,
          name: p.name,
          role: p.role,
          tenantId: p.tenantId ?? null,
          sessionId: p.sessionId,
        };
        next();
        return;
      } catch {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
    }
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const user = await resolveLocalUser(auth.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not active" });
      return;
    }
    req.user = {
      sub: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId ?? null,
      // Clerk sessions have no sessionId (session tracking via Clerk, not our table)
    };
    next();
  } catch (err) {
    req.log?.error(err, "Clerk user resolution failed");
    res.status(401).json({ error: "Authentication failed" });
  }
}

export async function authenticateOptional(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  let auth: { userId?: string | null } | null = null;
  try {
    auth = getAuth(req);
  } catch {
    auth = null;
  }
  if (auth?.userId) {
    try {
      const user = await resolveLocalUser(auth.userId);
      if (user?.isActive) {
        req.user = {
          sub: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId ?? null,
        };
      }
    } catch {
      // ignore
    }
  }
  next();
}
