import { Router } from "express";
import bcrypt from "bcryptjs";
import { usersTable, cashierShiftsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireTenant } from "../middleware/require-tenant.js";
import { logAudit } from "../lib/audit.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();
router.use(requireTenant);

// ── PIN login (quick cashier auth for POS) ────────────────────────────────
// POST /api/cashier/pin-login
// Body: { pin: string }  — any authenticated user may verify their own PIN
router.post("/cashier/pin-login", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const { pin, userId } = req.body as { pin?: string; userId?: number };

  if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 6 digits" });
    return;
  }

  // If userId provided, verify that specific user; otherwise verify requester
  const targetId = userId ?? parseInt(req.user!.sub, 10);

  const [user] = await req.db!
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, pin: usersTable.pin, isActive: usersTable.isActive })
    .from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tid)));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }
  if (!user.pin) {
    res.status(401).json({ error: "PIN not set for this user" });
    return;
  }

  const valid = await bcrypt.compare(pin, user.pin);
  if (!valid) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  void logAudit(req, "pin_verified", "users", user.id, { targetUserId: user.id });
  res.json({ ok: true, userId: user.id, name: user.name, role: user.role });
});

// ── Verify manager credential (Smart Lock) ───────────────────────────────
// POST /api/cashier/verify-manager
// Body: { pin?: string, password?: string, userId: number }
// Used to authorize sensitive POS actions (discount, cancel, price edit, etc.)
router.post("/cashier/verify-manager", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const { pin, password, userId, action } = req.body as {
    pin?: string;
    password?: string;
    userId?: number;
    action?: string;
  };

  if (!pin && !password) {
    res.status(400).json({ error: "PIN or password required" });
    return;
  }
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const [manager] = await req.db!
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, pin: usersTable.pin, password: usersTable.password, isActive: usersTable.isActive })
    .from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tid)));

  if (!manager || !manager.isActive) {
    res.status(401).json({ error: "Manager not found or inactive" });
    return;
  }

  // Only roles with override authority can approve smart-lock actions
  const ALLOWED_ROLES = ["admin", "owner", "branch_manager", "area_manager"];
  if (!ALLOWED_ROLES.includes(manager.role)) {
    res.status(403).json({ error: "This user does not have manager authority" });
    return;
  }

  let valid = false;
  if (pin && manager.pin) {
    valid = await bcrypt.compare(pin, manager.pin);
  } else if (password) {
    valid = await bcrypt.compare(password, manager.password);
  }

  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  void logAudit(req, "smart_lock_approved", "users", manager.id, {
    approvedBy: manager.name,
    action: action ?? "unknown",
    requestedBy: parseInt(req.user!.sub, 10),
  });

  res.json({ ok: true, approvedBy: manager.name, role: manager.role });
});

// ── Shift management ─────────────────────────────────────────────────────

// POST /api/cashier/shifts/start — start a new shift for the current user
router.post("/cashier/shifts/start", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);
  const { notes } = req.body as { notes?: string };

  // Close any already-open shift for this user first (defensive)
  await req.db!
    .update(cashierShiftsTable)
    .set({ isClosed: true, endedAt: new Date() })
    .where(and(
      eq(cashierShiftsTable.userId, uid),
      eq(cashierShiftsTable.tenantId, tid),
      isNull(cashierShiftsTable.endedAt),
    ));

  const [user] = await req.db!
    .select({ name: usersTable.name, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, uid));

  const [shift] = await req.db!
    .insert(cashierShiftsTable)
    .values({
      tenantId: tid,
      userId: uid,
      userName: user?.name ?? "",
      userRole: user?.role ?? req.user!.role ?? "cashier",
      notes: notes ?? null,
    })
    .returning();

  void logAudit(req, "shift_started", "cashier_shifts", shift.id, { userId: uid });
  res.status(201).json(shift);
});

// POST /api/cashier/shifts/end — close the current open shift
router.post("/cashier/shifts/end", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);
  const { notes } = req.body as { notes?: string };

  const [shift] = await req.db!
    .update(cashierShiftsTable)
    .set({
      isClosed: true,
      endedAt: new Date(),
      ...(notes ? { notes } : {}),
    })
    .where(and(
      eq(cashierShiftsTable.userId, uid),
      eq(cashierShiftsTable.tenantId, tid),
      isNull(cashierShiftsTable.endedAt),
    ))
    .returning();

  if (!shift) {
    res.status(404).json({ error: "No active shift found" });
    return;
  }

  void logAudit(req, "shift_ended", "cashier_shifts", shift.id, { userId: uid, orderCount: shift.orderCount, totalSales: shift.totalSales });
  res.json(shift);
});

// GET /api/cashier/shifts/current — current open shift for requester
router.get("/cashier/shifts/current", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);

  const [shift] = await req.db!
    .select()
    .from(cashierShiftsTable)
    .where(and(
      eq(cashierShiftsTable.userId, uid),
      eq(cashierShiftsTable.tenantId, tid),
      isNull(cashierShiftsTable.endedAt),
    ))
    .limit(1);

  res.json(shift ?? null);
});

// GET /api/cashier/shifts — list shifts (admin: all, cashier: own)
router.get("/cashier/shifts", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const uid = parseInt(req.user!.sub, 10);
  const role = req.user!.role;

  const MANAGER_ROLES = ["admin", "owner", "branch_manager", "area_manager", "accountant"];
  const isManager = MANAGER_ROLES.includes(role);

  const conditions = isManager
    ? [eq(cashierShiftsTable.tenantId, tid)]
    : [eq(cashierShiftsTable.tenantId, tid), eq(cashierShiftsTable.userId, uid)];

  const shifts = await req.db!
    .select()
    .from(cashierShiftsTable)
    .where(and(...conditions as Parameters<typeof and>))
    .orderBy(desc(cashierShiftsTable.startedAt))
    .limit(200);

  res.json(shifts);
});

// PATCH /api/cashier/shifts/:id — update shift stats (called by order completion)
router.patch("/cashier/shifts/:id", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const id = parseInt(req.params.id as string);
  const { orderCount, totalSales, totalReturns, totalDiscounts, totalCancellations } = req.body as {
    orderCount?: number;
    totalSales?: string;
    totalReturns?: string;
    totalDiscounts?: string;
    totalCancellations?: number;
  };

  const update: Record<string, unknown> = {};
  if (orderCount !== undefined) update.orderCount = orderCount;
  if (totalSales !== undefined) update.totalSales = totalSales;
  if (totalReturns !== undefined) update.totalReturns = totalReturns;
  if (totalDiscounts !== undefined) update.totalDiscounts = totalDiscounts;
  if (totalCancellations !== undefined) update.totalCancellations = totalCancellations;

  const [shift] = await req.db!
    .update(cashierShiftsTable)
    .set(update as Partial<typeof cashierShiftsTable.$inferInsert>)
    .where(and(eq(cashierShiftsTable.id, id), eq(cashierShiftsTable.tenantId, tid)))
    .returning();

  if (!shift) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  res.json(shift);
});

export default router;
