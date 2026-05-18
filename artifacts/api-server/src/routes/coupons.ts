import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { couponsTable, couponUsageTable } from "@workspace/db";
import { logAudit } from "../lib/audit.js";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

router.use(requireTenant);

// GET /coupons
router.get("/coupons", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const coupons = await req.db!.select().from(couponsTable)
    .where(eq(couponsTable.tenantId, tid))
    .orderBy(desc(couponsTable.createdAt));
  res.json(coupons);
});

// GET /coupons/:id
router.get("/coupons/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;

  const [coupon] = await req.db!.select().from(couponsTable)
    .where(and(eq(couponsTable.id, id), eq(couponsTable.tenantId, tid)));
  if (!coupon) { res.status(404).json({ error: "Coupon not found" }); return; }

  const usage = await req.db!.select().from(couponUsageTable)
    .where(eq(couponUsageTable.couponId, id))
    .orderBy(desc(couponUsageTable.usedAt))
    .limit(50);

  res.json({ ...coupon, usage });
});

// POST /coupons/validate — must be before /:id
router.post("/coupons/validate", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const { code, orderAmount } = req.body as { code: string; orderAmount: number };
  if (!code || orderAmount == null) { res.status(400).json({ error: "code and orderAmount required" }); return; }

  const [coupon] = await req.db!.select().from(couponsTable)
    .where(and(eq(couponsTable.code, code.toUpperCase()), eq(couponsTable.tenantId, tid)));

  if (!coupon) { res.status(404).json({ error: "Coupon not found", valid: false }); return; }
  if (!coupon.isActive) { res.status(400).json({ error: "Coupon is not active", valid: false }); return; }

  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    res.status(400).json({ error: "Coupon not yet valid", valid: false }); return;
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    res.status(400).json({ error: "Coupon expired", valid: false }); return;
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    res.status(400).json({ error: "Coupon usage limit reached", valid: false }); return;
  }
  const minOrder = parseFloat(coupon.minOrderAmount ?? "0");
  if (orderAmount < minOrder) {
    res.status(400).json({ error: `Minimum order amount is ${minOrder}`, valid: false }); return;
  }

  const couponValue = parseFloat(coupon.value);
  let discountAmount: number;
  if (coupon.type === "percentage") {
    discountAmount = Math.min(orderAmount * (couponValue / 100), orderAmount);
  } else {
    discountAmount = Math.min(couponValue, orderAmount);
  }

  res.json({
    valid: true,
    coupon: { id: coupon.id, code: coupon.code, type: coupon.type, value: couponValue },
    discountAmount: Math.round(discountAmount * 100) / 100,
  });
});

// POST /coupons
router.post("/coupons", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const { code, description, type, value, minOrderAmount, maxUses, maxUsesPerCustomer, validFrom, validUntil } = req.body as {
    code: string; description?: string; type: "percentage" | "fixed"; value: number;
    minOrderAmount?: number; maxUses?: number; maxUsesPerCustomer?: number;
    validFrom?: string; validUntil?: string;
  };

  if (!code || !type || !value) { res.status(400).json({ error: "code, type, value required" }); return; }

  try {
    const [coupon] = await req.db!.insert(couponsTable).values({
      tenantId: req.tenantId!,
      code: code.toUpperCase(),
      description,
      type,
      value: String(value),
      minOrderAmount: minOrderAmount ? String(minOrderAmount) : "0",
      maxUses,
      maxUsesPerCustomer,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
    }).returning();

    await logAudit(req, "CREATE", "coupon", String(coupon.id), { code });
    res.status(201).json(coupon);
  } catch {
    res.status(409).json({ error: "Coupon code already exists" });
  }
});

// PATCH /coupons/:id
router.patch("/coupons/:id", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  const { description, isActive, maxUses, validUntil } = req.body as Partial<{
    description: string; isActive: boolean; maxUses: number; validUntil: string;
  }>;

  const [coupon] = await req.db!.update(couponsTable)
    .set({ description, isActive, maxUses, validUntil: validUntil ? new Date(validUntil) : undefined })
    .where(and(eq(couponsTable.id, id), eq(couponsTable.tenantId, tid)))
    .returning();

  if (!coupon) { res.status(404).json({ error: "Coupon not found" }); return; }
  res.json(coupon);
});

// DELETE /coupons/:id
router.delete("/coupons/:id", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  await req.db!.delete(couponsTable)
    .where(and(eq(couponsTable.id, id), eq(couponsTable.tenantId, tid)));
  await logAudit(req, "DELETE", "coupon", String(id));
  res.json({ success: true });
});

// POST /coupons/:id/use
router.post("/coupons/:id/use", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  const { orderId, customerId, discountAmount } = req.body as {
    orderId?: number; customerId?: number; discountAmount: number;
  };

  // Verify coupon belongs to tenant
  const [coupon] = await req.db!.select({ id: couponsTable.id })
    .from(couponsTable)
    .where(and(eq(couponsTable.id, id), eq(couponsTable.tenantId, tid)));
  if (!coupon) { res.status(404).json({ error: "Coupon not found" }); return; }

  await req.db!.transaction(async (tx) => {
    await tx.update(couponsTable)
      .set({ usedCount: sql`${couponsTable.usedCount} + 1` })
      .where(and(eq(couponsTable.id, id), eq(couponsTable.tenantId, tid)));

    await tx.insert(couponUsageTable).values({
      couponId: id,
      orderId,
      customerId,
      discountAmount: String(discountAmount),
    });
  });

  res.json({ success: true });
});

export default router;
