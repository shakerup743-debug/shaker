import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import {
  validateBusinessType,
  businessTypeLabel,
} from "../lib/business-types.js";

const router = Router();

/**
 * POST /api/auth/signup
 * Email + password registration.
 *
 * The first user to sign up becomes the OWNER of their own newly-created tenant.
 * Each new email creates a fresh tenant — no two restaurants share data.
 *
 * Business type MUST be restaurant-related — non-restaurant signups are rejected.
 */
router.post("/auth/signup", async (req, res): Promise<void> => {
  const body = req.body as {
    email?: string;
    password?: string;
    name?: string;
    restaurantName?: string;
    businessType?: string;
    businessTypeCustom?: string;
    lang?: "ar" | "en";
  };

  const email = body.email?.toLowerCase().trim();
  const password = body.password;
  const fullName = body.name?.trim();
  const restaurantName = body.restaurantName?.trim();
  const businessType = body.businessType?.trim();
  const businessTypeCustom = body.businessTypeCustom?.trim();
  const lang: "ar" | "en" = body.lang === "en" ? "en" : "ar";

  if (!email || !password || !fullName || !restaurantName || !businessType) {
    res.status(400).json({
      error:
        lang === "ar"
          ? "كل الحقول مطلوبة: البريد، كلمة المرور، الاسم، اسم المطعم، نوع النشاط."
          : "All fields are required: email, password, name, restaurantName, businessType",
    });
    return;
  }

  const btCheck = validateBusinessType(businessType, businessTypeCustom, lang);
  if (!btCheck.ok) {
    res.status(400).json({ error: btCheck.reason });
    return;
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  // Check for existing user
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  // Hash password
  const hashed = await bcrypt.hash(password, 10);

  // Create new tenant
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
      name: restaurantName,
      primaryColor: "#E67E22",
      currency: "SAR",
      taxRate: "15",
      country: "SA",
      timezone: "Asia/Riyadh",
      businessType:
        businessType === "other"
          ? businessTypeCustom!
          : businessTypeLabel(businessType, undefined, "ar"),
      subscriptionPlan: "starter",
      subscriptionStatus: "trial",
      subscriptionExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
      isActive: true,
    })
    .returning();

  // Create owner user
  const [user] = await db
    .insert(usersTable)
    .values({
      tenantId: newTenant!.id,
      name: fullName,
      email,
      password: hashed,
      role: "owner",
      isActive: true,
    })
    .returning();

  // Seed starter categories so new owners see something on their first POS load
  try {
    const { categoriesTable } = await import("@workspace/db");
    await db.insert(categoriesTable).values([
      { tenantId: newTenant!.id, name: "Beverages",     nameEn: "Beverages",     color: "#3B82F6", icon: "coffee",   sortOrder: 1 },
      { tenantId: newTenant!.id, name: "Main Dishes",   nameEn: "Main Dishes",   color: "#EF4444", icon: "utensils", sortOrder: 2 },
      { tenantId: newTenant!.id, name: "Appetizers",    nameEn: "Appetizers",    color: "#F59E0B", icon: "salad",    sortOrder: 3 },
      { tenantId: newTenant!.id, name: "Desserts",      nameEn: "Desserts",      color: "#EC4899", icon: "cake",     sortOrder: 4 },
    ]);
  } catch {
    // non-fatal — owner can create categories manually
  }

  // Create a 14-day TRIAL subscription so the SaaS billing flow works out of the box.
  try {
    const { sql } = await import("drizzle-orm");
    const { TRIAL_DAYS } = await import("@workspace/db");
    await db.execute(sql`
      INSERT INTO subscriptions (tenant_id, plan, status, trial_ends_at)
      VALUES (${newTenant!.id}, 'starter', 'trial', NOW() + INTERVAL '${sql.raw(String(TRIAL_DAYS))} days')
      ON CONFLICT (tenant_id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO billing_events (tenant_id, event_type, payload)
      VALUES (${newTenant!.id}, 'trial_started', ${JSON.stringify({ days: TRIAL_DAYS, source: "signup" })})
    `);
  } catch {
    // non-fatal — subscription endpoint will create on first access
  }

  // Issue JWT
  const token = await signToken({
    sub: String(user!.id),
    email: user!.email,
    name: user!.name,
    role: user!.role,
    tenantId: user!.tenantId ?? undefined,
  });

  res.status(201).json({
    token,
    user: {
      id: user!.id,
      name: user!.name,
      email: user!.email,
      role: user!.role,
    },
    tenant: {
      id: newTenant!.id,
      name: newTenant!.name,
      slug: newTenant!.slug,
    },
  });
});

export default router;
