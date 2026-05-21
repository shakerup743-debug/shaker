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

const VALID_REASONS = new Set([
  "friend",     // صديق المطعم
  "manager",    // مسؤول (مدير/مالك)
  "employee",   // خصم موظفين
  "coupon",     // كوبون
  "other",      // أخرى — يتطلب نص حر
  // legacy values still accepted
  "vip", "occasion",
]);
const VALID_TYPES   = new Set(["percent", "amount"]);

/* ── GET caps ──────────────────────────────────────────────────────────── */
async function getDiscountSettings(req: Request, res: Response): Promise<void> {
  const tenantId = req.user!.tenantId!;
  const r = await db.execute(sql`
    SELECT role,
           max_discount_percent::float AS max_discount_percent,
           max_discount_amount::float  AS max_discount_amount,
           max_daily_uses,
           requires_reason
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

/* ── Tenant-level discount switch + max-cap (admin control) ───────────── */
router.get("/discounts/config", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const r = await db.execute(sql`
    SELECT discounts_enabled, discount_max_percent::float AS discount_max_percent
    FROM tenants WHERE id=${tenantId} LIMIT 1
  `);
  const row = r.rows[0] as { discounts_enabled: boolean; discount_max_percent: number } | undefined;
  res.json({
    enabled: row?.discounts_enabled ?? true,
    maxPercent: row?.discount_max_percent ?? 15,
  });
});

router.put(
  "/discounts/config",
  authorize("owner", "admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const { enabled, maxPercent } = req.body as { enabled?: boolean; maxPercent?: number };
    await db.execute(sql`
      UPDATE tenants
         SET discounts_enabled    = COALESCE(${enabled === undefined ? null : enabled}, discounts_enabled),
             discount_max_percent = COALESCE(${maxPercent === undefined ? null : maxPercent}, discount_max_percent),
             updated_at = NOW()
       WHERE id = ${tenantId}
    `);
    await logAudit(req, {
      entityType: "tenant",
      entityId: String(tenantId),
      action: "discount_config_update",
      metadata: { enabled, maxPercent },
    });
    res.json({ ok: true });
  },
);

/* ── Apply discount to an order ────────────────────────────────────────── */
router.post("/orders/:id/discount", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const cashierId = req.user!.userId ?? null;
  const role = req.user!.role;
  const orderId = Number(req.params.id);

  // Read cashier name + tenant gating. cashierId may be undefined when the
  // session lacks a numeric user id (e.g. Clerk session); guard the JOIN
  // accordingly so we don't emit malformed SQL.
  const ctxR = await db.execute(sql`
    SELECT
      ${cashierId === null
        ? sql`NULL::text`
        : sql`(SELECT name FROM users WHERE id=${cashierId} LIMIT 1)`}
      AS cashier_name,
      t.discounts_enabled,
      t.discount_max_percent::float AS discount_max_percent
    FROM tenants t
    WHERE t.id = ${tenantId}
    LIMIT 1
  `);
  const ctx = ctxR.rows[0] as {
    cashier_name: string | null;
    discounts_enabled: boolean;
    discount_max_percent: number;
  } | undefined;

  // Master switch — discounts globally off
  if (!ctx?.discounts_enabled) {
    res.status(403).json({
      error: "DISCOUNTS_DISABLED",
      message: "الخصومات معطلة حالياً من قبل الإدارة.",
    });
    return;
  }
  const tenantMaxPct = ctx.discount_max_percent ?? 15;

  const {
    reason, couponCode, customerName, customerPhone,
    discountType, discountValue, discountKind,
  } = req.body as {
    reason?: string; couponCode?: string;
    customerName?: string; customerPhone?: string;
    discountType?: string; discountValue?: number;
    discountKind?: string;
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

  // Tenant-wide ceiling (default 15% — owner-configurable)
  if (discountType === "percent" && discountValue > tenantMaxPct) {
    await db.execute(sql`
      INSERT INTO discount_logs (tenant_id, order_id, cashier_id, cashier_name, reason, discount_kind,
                                 customer_name, customer_phone, discount_type, discount_value,
                                 rejected, rejection_reason)
      VALUES (${tenantId}, ${orderId}, ${cashierId}, ${ctx?.cashier_name ?? null}, ${reason}, ${discountKind ?? null},
              ${customerName ?? null}, ${customerPhone ?? null}, ${discountType}, ${discountValue},
              TRUE, ${`النسبة ${discountValue}% تتجاوز الحد الأقصى ${tenantMaxPct}%`})
    `);
    res.status(403).json({
      error: "EXCEEDS_TENANT_MAX",
      message: `الحد الأقصى للخصم ${tenantMaxPct}%.`,
    });
    return;
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
        INSERT INTO discount_logs (tenant_id, order_id, cashier_id, cashier_name, reason, discount_kind, customer_name, customer_phone, discount_type, discount_value, rejected, rejection_reason)
        VALUES (${tenantId}, ${orderId}, ${cashierId}, ${ctx?.cashier_name ?? null}, ${reason}, ${discountKind ?? null}, ${customerName ?? null}, ${customerPhone ?? null}, ${discountType}, ${discountValue}, TRUE, ${"يتجاوز سقف الخصم"})
      `);
      res.status(403).json({ error: "DISCOUNT_EXCEEDS_CAP", message: `الحد الأقصى للنسبة المسموحة لدورك: ${cap.max_discount_percent}%` });
      return;
    }
    if (discountType === "amount" && cap.max_discount_amount != null && discountValue > Number(cap.max_discount_amount)) {
      await db.execute(sql`
        INSERT INTO discount_logs (tenant_id, order_id, cashier_id, cashier_name, reason, discount_kind, customer_name, customer_phone, discount_type, discount_value, rejected, rejection_reason)
        VALUES (${tenantId}, ${orderId}, ${cashierId}, ${ctx?.cashier_name ?? null}, ${reason}, ${discountKind ?? null}, ${customerName ?? null}, ${customerPhone ?? null}, ${discountType}, ${discountValue}, TRUE, ${"يتجاوز سقف الخصم"})
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
      SELECT id, type, value, valid_until, max_uses, used_count, is_active
      FROM coupons WHERE tenant_id=${tenantId} AND code=${couponCode.trim()} LIMIT 1
    `);
    const c = cR.rows[0] as { id: number; valid_until: Date | null; max_uses: number | null; used_count: number; is_active: boolean } | undefined;
    if (!c || !c.is_active) { res.status(400).json({ error: "COUPON_INVALID" }); return; }
    if (c.valid_until && new Date(c.valid_until) < new Date()) { res.status(400).json({ error: "COUPON_EXPIRED" }); return; }
    if (c.max_uses != null && c.used_count >= c.max_uses) { res.status(400).json({ error: "COUPON_EXHAUSTED" }); return; }
    couponId = c.id;
    await db.execute(sql`UPDATE coupons SET used_count = used_count + 1 WHERE id=${c.id}`);
  }

  // Compute the order amounts for audit trail (subtotal + total-after).
  const ordR = await db.execute(sql`
    SELECT subtotal::float AS subtotal, total::float AS total, discount::float AS discount_amount
    FROM orders WHERE id=${orderId} AND tenant_id=${tenantId} LIMIT 1
  `);
  const ord = ordR.rows[0] as { subtotal: number; total: number; discount_amount: number } | undefined;
  const orderSubtotal = ord?.subtotal ?? 0;
  const computedDiscount = discountType === "percent"
    ? Math.round(orderSubtotal * (discountValue / 100) * 100) / 100
    : Math.min(discountValue, orderSubtotal);
  const orderTotalAfter = Math.max(0, (ord?.total ?? 0) - computedDiscount);

  // Apply discount to order — use req.db (tenant-scoped, foodoro_app role)
  // so RLS policies on the orders table apply correctly.
  try {
    await req.db!.execute(sql`
      UPDATE orders
         SET discount   = discount + ${computedDiscount}::numeric,
             total      = GREATEST(0::numeric, total - ${computedDiscount}::numeric)
       WHERE id = ${orderId} AND tenant_id = ${tenantId}
    `);
  } catch (err) {
    const e = err as Error & { cause?: { code?: string; detail?: string; hint?: string; severity?: string; message?: string; where?: string }; code?: string; detail?: string; message?: string };
    const cause = e.cause ?? {};
    req.log?.error({ err, cause }, "discount update failed");
    res.status(500).json({
      error: "DB_ERROR",
      pgCode:    cause.code    ?? e.code,
      pgMessage: cause.message ?? null,
      pgDetail:  cause.detail  ?? e.detail,
      pgHint:    cause.hint    ?? null,
      pgWhere:   cause.where   ?? null,
    });
    return;
  }

  await db.execute(sql`
    INSERT INTO discount_logs (
      tenant_id, order_id, cashier_id, cashier_name, reason, discount_kind,
      coupon_id, coupon_code,
      customer_name, customer_phone,
      discount_type, discount_value,
      order_subtotal, order_total_after
    )
    VALUES (
      ${tenantId}, ${orderId}, ${cashierId}, ${ctx?.cashier_name ?? null}, ${reason}, ${discountKind ?? reason},
      ${couponId}, ${couponCode ?? null},
      ${customerName ?? null}, ${customerPhone ?? null},
      ${discountType}, ${discountValue},
      ${orderSubtotal}, ${orderTotalAfter}
    )
  `);

  await logAudit(req, { entityType: "order", entityId: String(orderId), action: "discount_applied", metadata: { reason, discountKind, discountType, discountValue, couponId, computedDiscount } });
  res.json({ ok: true, computedDiscount, orderTotalAfter });
});

/* ── Discount log feed (with filters for the manager report page) ──────── */
router.get(
  "/discount-logs",
  authorize("owner", "admin", "manager", "accountant"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const { from, to, cashierId, kind, customer, minPercent } = req.query as Record<string, string>;

    const where: string[] = [`tenant_id=${tenantId}`];
    if (from) where.push(`created_at >= '${from}'`);
    if (to)   where.push(`created_at <= '${to} 23:59:59'`);
    if (cashierId) where.push(`cashier_id = ${Number(cashierId)}`);
    if (kind) where.push(`discount_kind = '${kind.replace(/'/g, "''")}'`);
    if (customer) where.push(`(customer_name ILIKE '%${customer.replace(/'/g, "''")}%' OR customer_phone ILIKE '%${customer.replace(/'/g, "''")}%')`);
    if (minPercent) where.push(`discount_type='percent' AND discount_value >= ${Number(minPercent)}`);

    const r = await db.execute(sql.raw(`
      SELECT id, order_id, cashier_id, cashier_name, reason, discount_kind,
             coupon_id, coupon_code,
             customer_name, customer_phone,
             discount_type, discount_value::float AS discount_value,
             order_subtotal::float AS order_subtotal,
             order_total_after::float AS order_total_after,
             rejected, rejection_reason,
             created_at
      FROM discount_logs WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC LIMIT 1000
    `));
    res.json({ logs: r.rows });
  },
);

/* ── Excel export of the discount report ───────────────────────────────── */
router.get(
  "/discount-logs/export.xlsx",
  authorize("owner", "admin", "manager", "accountant"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const r = await db.execute(sql`
      SELECT id, order_id, cashier_name, reason, discount_kind, coupon_code,
             customer_name, customer_phone,
             discount_type, discount_value::float AS discount_value,
             order_subtotal::float AS order_subtotal,
             order_total_after::float AS order_total_after,
             rejected, rejection_reason, created_at
      FROM discount_logs WHERE tenant_id=${tenantId}
      ORDER BY created_at DESC LIMIT 5000
    `);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Discounts");
    ws.columns = [
      { header: "التاريخ", key: "created_at", width: 22 },
      { header: "رقم الطلب", key: "order_id", width: 12 },
      { header: "الكاشير", key: "cashier_name", width: 18 },
      { header: "النوع", key: "discount_kind", width: 16 },
      { header: "كود الكوبون", key: "coupon_code", width: 14 },
      { header: "اسم العميل", key: "customer_name", width: 18 },
      { header: "جوال العميل", key: "customer_phone", width: 16 },
      { header: "نوع الخصم", key: "discount_type", width: 12 },
      { header: "قيمة الخصم", key: "discount_value", width: 12 },
      { header: "قبل الخصم", key: "order_subtotal", width: 12 },
      { header: "بعد الخصم", key: "order_total_after", width: 12 },
      { header: "حالة", key: "rejected", width: 10 },
      { header: "سبب الرفض", key: "rejection_reason", width: 22 },
    ];
    for (const row of r.rows as Record<string, unknown>[]) {
      ws.addRow({ ...row, rejected: row.rejected ? "مرفوض" : "مُطبَّق" });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="discounts.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  },
);

export default router;
