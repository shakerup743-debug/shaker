import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";

const router = Router();

const EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data";

interface EmergentSessionData {
  id: string;
  email: string;
  name: string;
  picture?: string;
  session_token: string;
}

/**
 * Exchange an Emergent Auth session_id for a FOODORO JWT.
 *
 * Flow:
 * 1. Frontend redirects user to https://auth.emergentagent.com/?redirect=...
 * 2. Google login happens
 * 3. Browser lands back at <redirect>#session_id=XYZ
 * 4. Frontend POSTs { session_id } to this endpoint
 * 5. We call Emergent's session-data endpoint to verify and get email/name
 * 6. We find or create the user (and a tenant for new users) in PostgreSQL
 * 7. We issue our own JWT — fully compatible with the existing /api/auth/login flow
 *
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */
router.post("/auth/google/session", async (req, res): Promise<void> => {
  const { session_id } = req.body as { session_id?: string };

  if (!session_id || typeof session_id !== "string") {
    res.status(400).json({ error: "session_id is required" });
    return;
  }

  // Verify session_id with Emergent
  let sessionData: EmergentSessionData;
  try {
    const resp = await fetch(EMERGENT_AUTH_URL, {
      method: "GET",
      headers: { "X-Session-ID": session_id },
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Emergent auth session-data failed");
      res.status(401).json({ error: "Invalid or expired Google session" });
      return;
    }
    sessionData = (await resp.json()) as EmergentSessionData;
  } catch (err) {
    logger.error({ err }, "Failed to reach Emergent auth service");
    res.status(502).json({ error: "Auth service unreachable" });
    return;
  }

  const email = sessionData.email?.toLowerCase().trim();
  const name = sessionData.name?.trim() || email.split("@")[0];

  if (!email) {
    res.status(400).json({ error: "Google account has no email" });
    return;
  }

  // Find or provision user
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user) {
    // New user — create their own tenant + owner account
    const slug =
      email
        .split("@")[0]!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 30) +
      "-" +
      Math.random().toString(36).slice(2, 7);

    const [newTenant] = await db
      .insert(tenantsTable)
      .values({
        slug,
        name: `${name}'s Restaurant`,
        primaryColor: "#E67E22",
        currency: "SAR",
        taxRate: "15",
        country: "SA",
        timezone: "Asia/Riyadh",
        subscriptionPlan: "enterprise",
        subscriptionStatus: "active",
        isActive: true,
      })
      .returning();

    [user] = await db
      .insert(usersTable)
      .values({
        tenantId: newTenant!.id,
        name,
        email,
        password: "", // Google-only user
        role: "owner",
        clerkId: `google:${sessionData.id}`,
        isActive: true,
      })
      .returning();

    // Seed starter categories for new owners
    try {
      const { categoriesTable } = await import("@workspace/db");
      await db.insert(categoriesTable).values([
        { tenantId: newTenant!.id, name: "Beverages",   nameEn: "Beverages",   color: "#3B82F6", icon: "coffee",   sortOrder: 1 },
        { tenantId: newTenant!.id, name: "Main Dishes", nameEn: "Main Dishes", color: "#EF4444", icon: "utensils", sortOrder: 2 },
        { tenantId: newTenant!.id, name: "Appetizers",  nameEn: "Appetizers",  color: "#F59E0B", icon: "salad",    sortOrder: 3 },
        { tenantId: newTenant!.id, name: "Desserts",    nameEn: "Desserts",    color: "#EC4899", icon: "cake",     sortOrder: 4 },
      ]);
    } catch {
      // non-fatal
    }
  } else if (!user.isActive) {
    res.status(401).json({ error: "Account is disabled" });
    return;
  } else if (!user.tenantId) {
    res.status(401).json({ error: "Account not assigned to any tenant" });
    return;
  }

  // Update last login
  void db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  // Issue our own JWT — same shape as /api/auth/login
  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId ?? undefined,
  });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      picture: sessionData.picture ?? null,
    },
  });
});

export default router;
