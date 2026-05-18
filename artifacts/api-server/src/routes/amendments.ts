import { Router } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { orderAmendmentsTable, ordersTable } from "@workspace/db";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(requireTenant);

// ── POST /orders/:id/amend ─────────────────────────────────────────────────
// Create an amendment record and optionally apply side effects to the order.
router.post(
  "/orders/:id/amend",
  authorize("admin", "owner", "cashier", "area_manager", "branch_manager"),
  async (req, res): Promise<void> => {
    const orderId = parseInt(req.params.id as string);
    const tid = req.tenantId!;
    const cashierId = parseInt(req.user!.sub, 10);
    const cashierName = req.user!.name ?? "Unknown";
    const cashierRole = req.user!.role ?? null;

    const { type, reason, customerName, customerPhone, discountAmount } = req.body as {
      type?: string;
      reason?: string;
      customerName?: string;
      customerPhone?: string;
      discountAmount?: number;
    };

    const VALID_TYPES = ["cancel", "discount", "return", "edit"];
    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: "type must be one of: cancel, discount, return, edit" });
      return;
    }
    if (!reason || reason.trim().length < 3) {
      res.status(400).json({ error: "reason is required (min 3 chars)" });
      return;
    }
    if (!customerName || customerName.trim().length < 1) {
      res.status(400).json({ error: "customerName is required" });
      return;
    }

    // Fetch the order
    const [order] = await req.db!
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tid)));

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const amountBefore = Number(order.total ?? 0);
    let amountAfter = amountBefore;

    // Apply side-effects based on type
    if (type === "cancel") {
      if (order.status === "completed" || order.status === "cancelled") {
        res.status(409).json({ error: "Cannot cancel a completed or already-cancelled order" });
        return;
      }
      await req.db!
        .update(ordersTable)
        .set({ status: "cancelled" })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tid)));
      amountAfter = 0;
    } else if (type === "discount" && discountAmount != null && discountAmount > 0) {
      const newDiscount = Number(order.discount ?? 0) + discountAmount;
      const newTotal = Math.max(0, amountBefore - discountAmount);
      await req.db!
        .update(ordersTable)
        .set({ discount: String(newDiscount), total: String(newTotal) })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tid)));
      amountAfter = newTotal;
    } else if (type === "return" && discountAmount != null && discountAmount > 0) {
      amountAfter = discountAmount;
    }

    // Record the amendment
    const [amendment] = await req.db!
      .insert(orderAmendmentsTable)
      .values({
        tenantId: tid,
        orderId,
        orderNumber: order.orderNumber,
        type,
        reason: reason.trim(),
        customerName: customerName.trim(),
        customerPhone: customerPhone?.trim() ?? null,
        cashierId,
        cashierName,
        cashierRole,
        amountBefore: String(amountBefore),
        amountAfter: String(amountAfter),
        discountAmount: discountAmount != null ? String(discountAmount) : null,
      })
      .returning();

    void logAudit(req, `order_${type}`, "orders", orderId, {
      amendmentId: amendment.id,
      orderNumber: order.orderNumber,
      reason,
      customerName,
      amountBefore,
      amountAfter,
    });

    res.status(201).json(amendment);
  },
);

// ── PATCH /amendments/:id/print ───────────────────────────────────────────
// Mark an amendment as printed.
router.patch(
  "/amendments/:id/print",
  authorize("admin", "owner", "cashier", "area_manager", "branch_manager"),
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id as string);
    const tid = req.tenantId!;

    const [updated] = await req.db!
      .update(orderAmendmentsTable)
      .set({ printed: "yes", printedAt: new Date() })
      .where(and(eq(orderAmendmentsTable.id, id), eq(orderAmendmentsTable.tenantId, tid)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Amendment not found" });
      return;
    }
    res.json(updated);
  },
);

// ── GET /amendments ───────────────────────────────────────────────────────
// List all amendments for the tenant (for reports). Supports ?from=&to=&type=
router.get(
  "/amendments",
  authorize("admin", "owner", "cashier", "area_manager", "branch_manager", "accountant"),
  async (req, res): Promise<void> => {
    const tid = req.tenantId!;
    const { from, to, type } = req.query as { from?: string; to?: string; type?: string };

    const conditions = [eq(orderAmendmentsTable.tenantId, tid)];
    if (from) conditions.push(gte(orderAmendmentsTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(orderAmendmentsTable.createdAt, toDate));
    }
    if (type && ["cancel", "discount", "return", "edit"].includes(type)) {
      conditions.push(eq(orderAmendmentsTable.type, type));
    }

    const rows = await req.db!
      .select()
      .from(orderAmendmentsTable)
      .where(and(...conditions))
      .orderBy(desc(orderAmendmentsTable.createdAt));

    res.json(rows);
  },
);

// ── GET /orders/:id/amendments ────────────────────────────────────────────
// List all amendments for a specific order.
router.get(
  "/orders/:id/amendments",
  authorize("admin", "owner", "cashier", "area_manager", "branch_manager", "accountant"),
  async (req, res): Promise<void> => {
    const orderId = parseInt(req.params.id as string);
    const tid = req.tenantId!;

    const rows = await req.db!
      .select()
      .from(orderAmendmentsTable)
      .where(and(eq(orderAmendmentsTable.orderId, orderId), eq(orderAmendmentsTable.tenantId, tid)))
      .orderBy(desc(orderAmendmentsTable.createdAt));

    res.json(rows);
  },
);

export default router;
