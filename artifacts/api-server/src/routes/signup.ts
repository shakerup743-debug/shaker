import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";

const router = Router();

/**
 * POST /api/auth/signup
 * Email + password registration.
 *
 * The first user to sign up becomes the OWNER of their own newly-created tenant.
 * Each new email creates a fresh tenant — no two restaurants share data.
 */
router.post("/auth/signup", async (req, res): Promise<void> => {
  const body = req.body as {
    email?: string;
    password?: string;
    name?: string;
    restaurantName?: string;
  };

  const email = body.email?.toLowerCase().trim();
  const password = body.password;
  const fullName = body.name?.trim();
  const restaurantName = body.restaurantName?.trim();

  if (!email || !password || !fullName || !restaurantName) {
    res.status(400).json({
      error: "All fields are required: email, password, name, restaurantName",
    });
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
      subscriptionPlan: "starter",
      subscriptionStatus: "trial",
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
