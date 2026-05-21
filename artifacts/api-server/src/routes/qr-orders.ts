/**
 * QR Orders router — enables cashier to manage / list / collect-payment / export
 * the table-side orders submitted via QR menu.
 *
 *  GET  /api/qr-orders                       — list QR orders (latest first)
 *  POST /api/qr-orders/:id/customer-info     — record customer name + phone
 *  POST /api/qr-orders/:id/pay               — close the bill with a payment method
 *  GET  /api/qr-orders/export                — XLSX dump of all QR bills
 */
import { Router, type Request, type Response } from "express";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { logAudit } from "../lib/audit.js";
import { socketBroker } from "../lib/socket-broker.js";

const router = Router();

router.use(authenticate);

function emit(tenantId: number, type: string, payload: unknown): void {
  socketBroker.emit({ type, payload, tenantId, timestamp: new Date().toISOString() });
}

/* ── LIST ─────────────────────────────────────────────────────────────── */
router.get("/qr-orders", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const search = (req.query.search as string | undefined)?.trim();
  const status = (req.query.status as string | undefined)?.trim();

  const r = await db.execute(sql`
    SELECT
      o.id, o.table_number, o.status, o.created_at, o.kitchen_ready_at,
      o.customer_name, o.customer_phone, o.general_note,
      o.subtotal, o.tax, o.total, o.payment_method, o.source,
      COALESCE(json_agg(json_build_object(
        'id', oi.id, 'product_name', oi.product_name,
        'quantity', oi.quantity, 'unit_price', oi.unit_price,
        'subtotal', oi.subtotal, 'item_note', oi.item_note
      )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.tenant_id = ${tenantId}
      AND o.source = 'qr'
      ${status ? sql`AND o.status = ${status}` : sql``}
      ${search
        ? sql`AND (CAST(o.table_number AS TEXT) ILIKE ${"%" + search + "%"}
                OR o.customer_name ILIKE ${"%" + search + "%"})`
        : sql``}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 200
  `);
  res.json({ orders: r.rows });
});

/* ── CUSTOMER INFO ────────────────────────────────────────────────────── */
router.post("/qr-orders/:id/customer-info", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const id = Number(req.params.id);
  const { name, phone } = req.body as { name?: string; phone?: string };

  const cleanName = (name ?? "").trim();
  if (cleanName.length < 2) {
    res.status(400).json({ error: "اسم العميل مطلوب" });
    return;
  }
  const cleanPhone = phone?.trim().replace(/[^\d+]/g, "") ?? null;

  const r = await db.execute(sql`
    UPDATE orders
       SET customer_name = ${cleanName},
           customer_phone = ${cleanPhone}
     WHERE id = ${id} AND tenant_id = ${tenantId} AND source = 'qr'
    RETURNING id
  `);
  if (!r.rows[0]) { res.status(404).json({ error: "Order not found" }); return; }
  await logAudit(req, {
    entityType: "order", entityId: String(id),
    action: "qr_customer_info_set",
    metadata: { name: cleanName, phone: cleanPhone },
  });
  emit(tenantId, "qr_order_updated", { orderId: id, customerName: cleanName });
  res.json({ ok: true });
});

/* ── PAY ──────────────────────────────────────────────────────────────── */
const VALID_METHODS = new Set(["cash", "card", "wallet"]);
router.post("/qr-orders/:id/pay", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const id = Number(req.params.id);
  const { payment_method } = req.body as { payment_method?: string };
  if (!payment_method || !VALID_METHODS.has(payment_method)) {
    res.status(400).json({ error: "طريقة دفع غير صالحة" });
    return;
  }
  const r = await db.execute(sql`
    UPDATE orders SET status='completed', payment_method=${payment_method}, updated_at=NOW()
     WHERE id=${id} AND tenant_id=${tenantId} AND source='qr'
    RETURNING id, total
  `);
  if (!r.rows[0]) { res.status(404).json({ error: "Order not found" }); return; }
  await logAudit(req, {
    entityType: "order", entityId: String(id),
    action: "qr_paid",
    metadata: { method: payment_method },
  });
  emit(tenantId, "order:paid", { orderId: id, method: payment_method });
  res.json({ ok: true, paymentMethod: payment_method });
});

/* ── EXPORT XLSX ──────────────────────────────────────────────────────── */
router.get(
  "/qr-orders/export",
  authorize("owner", "admin", "manager", "accountant"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const rows = await db.execute(sql`
      SELECT o.id, o.table_number, o.created_at, o.kitchen_ready_at,
             o.status, o.customer_name, o.customer_phone,
             o.subtotal, o.tax, o.total, o.payment_method, o.general_note
      FROM orders o
      WHERE o.tenant_id=${tenantId} AND o.source='qr'
      ORDER BY o.created_at DESC
    `);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("QR Orders");
    ws.columns = [
      { header: "Order #",     key: "id",                width: 10 },
      { header: "Table",       key: "table_number",      width: 10 },
      { header: "Created",     key: "created_at",        width: 22 },
      { header: "Ready",       key: "kitchen_ready_at",  width: 22 },
      { header: "Status",      key: "status",            width: 14 },
      { header: "Customer",    key: "customer_name",     width: 22 },
      { header: "Phone",       key: "customer_phone",    width: 16 },
      { header: "Subtotal",    key: "subtotal",          width: 12 },
      { header: "Tax",         key: "tax",               width: 10 },
      { header: "Total",       key: "total",             width: 12 },
      { header: "Method",      key: "payment_method",    width: 12 },
      { header: "Note",        key: "general_note",      width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows.rows) ws.addRow(r);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="qr-orders-${Date.now()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  },
);

export default router;
