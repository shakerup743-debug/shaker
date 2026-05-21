/**
 * Discount management — role-based caps + mandatory reason logging.
 *
 *  GET   /api/discount-settings           — per-role caps
 *  PUT   /api/discount-settings           — owner/admin update caps
 *  POST  /api/discounts/validate          — pre-flight check before applying
 *  POST  /api/orders/:id/discount         — apply discount (logged + audited)
 *  GET   /api/discount-logs               — recent discount log entries
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(authenticate);

const VALID_REASONS = new Set(["vip", "friend", "coupon", "occasion", "other"]);
const VALID_TYPES   = new Set(["percent", "amount"]);

/* ── GET caps ──────────────────────────────────────────────────────────── */
async function getDiscountSettings(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!;
  const r = await db.execute(sql`
    SELECT role, max_discount_percent, max_discount_amount, max_daily_uses, requires_reason
    FROM discount_settings WHERE tenant_id=${tenantId} ORDER BY role
  `);
  res.json({ settings: r.rows });
}
router.get("/discount-settings", getDiscountSettings);
// Alias matching the documented spec.
router.get("/discounts/settings", getDiscountSettings);

/* ── PUT caps ──────────────────────────────────────────────────────────── */
router.put(
  "/discount-settings",
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const items = (req.body?.settings as Array<{
      role: string; max_discount_percent?: number;
      max_discount_amount?: number | null; max_daily_uses?: number;
      requires_reason?: boolean;
    }> | undefined) ?? [];
    for (const it of items) {
      await db.execute(sql`
        INSERT INTO discount_settings (tenant_id, role, max_discount_percent, max_discount_amount, max_daily_uses, requires_reason)
        VALUES (${tenantId}, ${it.role}, ${it.max_discount_percent ?? 100}, ${it.max_discount_amount ?? null}, ${it.max_daily_uses ?? 999}, ${it.requires_reason ?? true})
        ON CONFLICT (tenant_id, role) DO UPDATE
          SET max_discount_percent = EXCLUDED.max_discount_percent,
              max_discount_amount  = EXCLUDED.max_discount_amount,
              max_daily_uses       = EXCLUDED.max_daily_uses,
              requires_reason      = EXCLUDED.requires_reason,
              updated_at = NOW()
      `);
    }
    await logAudit(req, { entityType: "discount_settings", entityId: String(tenantId), action: "update", metadata: { items } });
    res.json({ ok: true });
  },
);

/* ── Apply discount to an order ────────────────────────────────────────── */
router.post("/orders/:id/discount", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const cashierId = req.user!.userId;
  const role = req.user!.role;
  const orderId = Number(req.params.id);

  const {
    reason, couponCode, customerName, customerPhone,
    discountType, discountValue,
  } = req.body as {
    reason?: string; couponCode?: string;
    customerName?: string; customerPhone?: string;
    discountType?: string; discountValue?: number;
  };

  if (!reason || !VALID_REASONS.has(reason)) {
    res.status(400).json({ error: "REASON_REQUIRED", message: "سبب الخصم إلزامي." });
    return;
  }
  if (!discountType || !VALID_TYPES.has(discountType) || !discountValue || discountValue <= 0) {
    res.status(400).json({ error: "INVALID_DISCOUNT" });
    return;
  }

  // Non-coupon → name + phone required
  if (reason !== "coupon") {
    if (!customerName?.trim() || !customerPhone?.trim()) {
      res.status(400).json({ error: "CUSTOMER_INFO_REQUIRED", message: "اسم ورقم العميل مطلوبان للخصم اليدوي." });
      return;
    }
  }

  // Validate role cap
  const capRow = await db.execute(sql`
    SELECT max_discount_percent, max_discount_amount FROM discount_settings
    WHERE tenant_id=${tenantId} AND role=${role}
  `);
  const cap = capRow.rows[0] as { max_discount_percent: number; max_discount_amount: number | null } | undefined;
  if (cap) {
    if (discountType === "percent" && cap.max_discount_percent != null && discountValue > Number(cap.max_discount_percent)) {
      await db.execute(sql`
        INSERT INTO discount_logs (tenant_id, order_id, cashier_id, reason, customer_name, customer_phone, discount_type, discount_value, rejected, rejection_reason)
        VALUES (${tenantId}, ${orderId}, ${cashierId}, ${reason}, ${customerName ?? null}, ${customerPhone ?? null}, ${discountType}, ${discountValue}, TRUE, ${"يتجاوز سقف الخصم"})
      `);
      res.status(403).json({ error: "DISCOUNT_EXCEEDS_CAP", message: `الحد الأقصى للنسبة المسموحة لدورك: ${cap.max_discount_percent}%` });
      return;
    }
    if (discountType === "amount" && cap.max_discount_amount != null && discountValue > Number(cap.max_discount_amount)) {
      await db.execute(sql`
        INSERT INTO discount_logs (tenant_id, order_id, cashier_id, reason, customer_name, customer_phone, discount_type, discount_value, rejected, rejection_reason)
        VALUES (${tenantId}, ${orderId}, ${cashierId}, ${reason}, ${customerName ?? null}, ${customerPhone ?? null}, ${discountType}, ${discountValue}, TRUE, ${"يتجاوز سقف الخصم"})
      `);
      res.status(403).json({ error: "DISCOUNT_EXCEEDS_CAP", message: `الحد الأقصى للمبلغ المسموح لدورك: ${cap.max_discount_amount}` });
      return;
    }
  }

  // Validate coupon if used
  let couponId: number | null = null;
  if (reason === "coupon") {
    if (!couponCode?.trim()) { res.status(400).json({ error: "COUPON_REQUIRED" }); return; }
    const cR = await db.execute(sql`
      SELECT id, type, value, expiry_date, max_uses, used_count, is_active
      FROM coupons WHERE tenant_id=${tenantId} AND code=${couponCode.trim()} LIMIT 1
    `);
    const c = cR.rows[0] as { id: number; expiry_date: Date | null; max_uses: number | null; used_count: number; is_active: boolean } | undefined;
    if (!c || !c.is_active) { res.status(400).json({ error: "COUPON_INVALID" }); return; }
    if (c.expiry_date && new Date(c.expiry_date) < new Date()) { res.status(400).json({ error: "COUPON_EXPIRED" }); return; }
    if (c.max_uses != null && c.used_count >= c.max_uses) { res.status(400).json({ error: "COUPON_EXHAUSTED" }); return; }
    couponId = c.id;
    await db.execute(sql`UPDATE coupons SET used_count = used_count + 1 WHERE id=${c.id}`);
  }

  // Apply discount to order
  await db.execute(sql`
    UPDATE orders
       SET discount_amount = COALESCE(discount_amount, 0) + ${discountValue},
           updated_at = NOW()
     WHERE id = ${orderId} AND tenant_id = ${tenantId}
  `);

  await db.execute(sql`
    INSERT INTO discount_logs (tenant_id, order_id, cashier_id, reason, coupon_id, customer_name, customer_phone, discount_type, discount_value)
    VALUES (${tenantId}, ${orderId}, ${cashierId}, ${reason}, ${couponId}, ${customerName ?? null}, ${customerPhone ?? null}, ${discountType}, ${discountValue})
  `);

  await logAudit(req, { entityType: "order", entityId: String(orderId), action: "discount_applied", metadata: { reason, discountType, discountValue, couponId } });
  res.json({ ok: true });
});

/* ── Discount log feed ─────────────────────────────────────────────────── */
router.get("/discount-logs", authorize("owner", "admin", "manager", "accountant"), async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const r = await db.execute(sql`
    SELECT id, order_id, cashier_id, reason, customer_name, customer_phone,
           discount_type, discount_value, rejected, rejection_reason, created_at
    FROM discount_logs WHERE tenant_id=${tenantId}
    ORDER BY created_at DESC LIMIT 200
  `);
  res.json({ logs: r.rows });
});

export default router;
