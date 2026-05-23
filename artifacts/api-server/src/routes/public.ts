import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { pool, createTenantDb, ordersTable, orderItemsTable, productsTable, categoriesTable, kitchenTicketsTable, tenantsTable, restaurantTablesTable, qrTokensTable, db } from "@workspace/db";
import { sseBroker } from "../lib/sse-broker.js";
import { CreateGuestOrderBody, CompleteOrderBody } from "@workspace/api-zod";
import {
  completeOrder,
  OrderNotFoundError,
  OrderAlreadyCompletedError,
} from "../services/orders.js";
import { logAudit } from "../lib/audit.js";
import {
  resolveOptionPricing,
  type ProductOptionGroupSpec,
  type ClientSelection,
} from "../lib/product-options.js";
import type pg from "pg";

const router: IRouter = Router();

function generateOrderNumber() {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 100);
  return `QR-${time}-${rand}`;
}

/** Resolve and validate the tenantId query param. Uses global db (tenants table has no RLS). */
async function resolveTenant(req: Request, res: Response): Promise<number | null> {
  const raw = req.query.tenantId;
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "tenantId query parameter is required" });
    return null;
  }
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "tenantId must be a positive integer" });
    return null;
  }
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return null;
  }
  return id;
}

/**
 * Acquire a per-request pool connection, SET app.current_tenant_id to satisfy
 * FORCE RLS policies, run fn, RESET and release.  The connection is held
 * exclusively for the duration of fn — no other request can observe the variable.
 */
async function withTenantDb<T>(
  tenantId: number,
  fn: (tenantDb: ReturnType<typeof createTenantDb>) => Promise<T>
): Promise<T> {
  const client: pg.PoolClient = await pool.connect();
  await client.query(`SET app.current_tenant_id = '${tenantId}'`);
  try {
    return await fn(createTenantDb(client));
  } finally {
    try { await client.query("RESET app.current_tenant_id"); } catch (_) {}
    client.release();
  }
}

/** GET /api/public/menu?tenantId=<id> — active product catalogue for a tenant. */
router.get("/public/menu", async (req, res): Promise<void> => {
  const tenantId = await resolveTenant(req, res);
  if (tenantId == null) return;

  const products = await withTenantDb(tenantId, (tdb) =>
    tdb
      .select({
        id: productsTable.id,
        name: productsTable.name,
        description: productsTable.description,
        price: productsTable.price,
        isActive: productsTable.isActive,
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color,
        imageUrl: productsTable.imageUrl,
        kitchenAvailable: productsTable.kitchenAvailable,
        unavailabilityReason: productsTable.unavailabilityReason,
      })
      .from(productsTable)
      .leftJoin(
        categoriesTable,
        and(
          eq(productsTable.categoryId, categoriesTable.id),
          eq(categoriesTable.tenantId, tenantId),
        )
      )
      .where(and(eq(productsTable.isActive, true), eq(productsTable.tenantId, tenantId)))
  );

  const [tenantRow] = await db.select({ settings: tenantsTable.settings }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  const tenantSettings = tenantRow?.settings as { hideUnavailableInQr?: boolean } | null;
  const filteredProducts = tenantSettings?.hideUnavailableInQr
    ? products.filter((p) => p.kitchenAvailable !== false)
    : products;

  res.json(filteredProducts.map((p) => ({ ...p, price: parseFloat(p.price) })));
});

/** POST /api/public/orders?tenantId=<id>&qrToken=qr_xxx — guest order from QR-code kiosk. */
router.post("/public/orders", async (req, res): Promise<void> => {
  const tenantId = await resolveTenant(req, res);
  if (tenantId == null) return;

  // Validate the 5-minute QR session window
  const qrToken = (req.query.qrToken as string | undefined) ?? (req.body?.qrToken as string | undefined);
  if (qrToken && qrToken.startsWith("qr_")) {
    const r = await db.execute(sql`
      SELECT is_active, session_expires_at FROM qr_tokens WHERE token = ${qrToken} LIMIT 1
    `);
    const row = r.rows[0] as { is_active: boolean; session_expires_at: Date | null } | undefined;
    if (!row || !row.is_active) {
      res.status(410).json({ error: "QR_SESSION_EXPIRED", message: "انتهت الجلسة. الرجاء مسح QR من جديد." });
      return;
    }
    if (row.session_expires_at && new Date(row.session_expires_at) < new Date()) {
      await db.execute(sql`UPDATE qr_tokens SET is_active=FALSE WHERE token=${qrToken}`);
      res.status(410).json({ error: "QR_SESSION_EXPIRED", message: "انتهت مهلة الطلب (5 دقائق). الرجاء مسح QR من جديد." });
      return;
    }
  }

  const parsed = CreateGuestOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { tableNumber, items, notes } = parsed.data;
  // Optional customer fields (passed through req.body — not in CreateGuestOrderBody schema)
  const customerName  = ((req.body as Record<string, unknown>).customerName  as string | undefined)?.trim() || null;
  const customerPhone = ((req.body as Record<string, unknown>).customerPhone as string | undefined)?.trim()?.replace(/[^\d+]/g, "") || null;
  const generalNote   = ((req.body as Record<string, unknown>).generalNote   as string | undefined)?.trim() || null;
  const attachmentUrl = ((req.body as Record<string, unknown>).attachmentUrl as string | undefined)?.trim() || null;

  await withTenantDb(tenantId, async (tdb) => {
    const products = await tdb
      .select()
      .from(productsTable)
      .where(eq(productsTable.tenantId, tenantId));

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const itemsToInsert: {
      productId: number; productName: string; quantity: number;
      unitPrice: string; baseUnitPrice: string; subtotal: string;
      notes: string | null;
      selectedOptions: Array<{ groupId: string; groupName: string; itemId: string; itemName: string; priceMode: "delta" | "full"; priceDelta: number; price?: number }>;
    }[] = [];

    // Raw items with potential selectedOptions outside the strict zod schema
    const rawItems = (req.body as { items?: Array<{ selectedOptions?: ClientSelection[] }> }).items ?? [];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]!;
      const product = productMap.get(item.productId);
      if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }
      if (!product.isActive || !product.kitchenAvailable) { res.status(400).json({ error: `Product ${product.name} is not available` }); return; }
      const basePrice = parseFloat(product.price);

      const productGroups = (product.optionGroups ?? []) as ProductOptionGroupSpec[];
      let resolved: ReturnType<typeof resolveOptionPricing>;
      try {
        resolved = resolveOptionPricing(
          basePrice,
          productGroups,
          rawItems[idx]?.selectedOptions ?? [],
          product.name,
        );
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
        return;
      }

      const itemSubtotal = Math.round(resolved.unitPrice * item.quantity * 100) / 100;
      subtotal += itemSubtotal;
      itemsToInsert.push({
        productId: item.productId, productName: product.name, quantity: item.quantity,
        unitPrice: String(resolved.unitPrice), baseUnitPrice: String(basePrice),
        subtotal: String(itemSubtotal), notes: item.notes ?? null,
        selectedOptions: resolved.selections,
      });
    }

    if (res.headersSent) return;

    const tax = subtotal * 0.15;
    const total = subtotal + tax;

    const completionToken = randomUUID();

    const [order] = await tdb
      .insert(ordersTable)
      .values({
        tenantId, orderNumber: generateOrderNumber(), type: "dine_in", status: "pending",
        subtotal: String(subtotal), discount: "0", tax: String(tax), total: String(total),
        tableNumber, notes: notes ?? null, completionToken,
        // QR-specific fields
        customerName, customerPhone, generalNote, source: "qr",
        attachmentUrl,
      })
      .returning();

    // Insert order items including the item_note from the customer
    await tdb.insert(orderItemsTable).values(itemsToInsert.map((i, idx) => ({
      ...i,
      orderId: order.id,
      itemNote: items[idx]?.notes ?? null,
    })));
    await tdb.insert(kitchenTicketsTable).values({ orderId: order.id, tenantId, status: "new" });

    sseBroker.emit({
      type: "order:created",
      data: { orderId: order.id, orderNumber: order.orderNumber, type: "dine_in", tableNumber },
    });

    void logAudit(req, "order:created", "orders", order.id, {
      orderNumber: order.orderNumber,
      type: "dine_in",
      total: String(total),
      tableNumber,
      source: "qr_public",
    });

    res.status(201).json({
      orderId: order.id, orderNumber: order.orderNumber, tableNumber, subtotal, tax, total,
      completionToken,
    });
  });
});

/**
 * POST /api/public/orders/:id/complete?tenantId=<id>
 * QR self-service payment completion. Uses the same shared completeOrder
 * service as the authenticated admin path so inventory, customer stats,
 * and SSE events are applied consistently.
 */
router.post("/public/orders/:id/complete", async (req, res): Promise<void> => {
  const tenantId = await resolveTenant(req, res);
  if (tenantId == null) return;

  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const token = req.query.token;
  if (typeof token !== "string" || token.trim() === "") {
    res.status(400).json({ error: "token query parameter is required" });
    return;
  }

  const [orderRow] = await withTenantDb(tenantId, (tdb) =>
    tdb.select({ completionToken: ordersTable.completionToken })
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tenantId)))
  );
  if (!orderRow) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (!orderRow.completionToken || orderRow.completionToken !== token) {
    res.status(401).json({ error: "Invalid completion token" });
    return;
  }

  const parsed = CompleteOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const { lowStockAlerts, previousStatus, total } = await withTenantDb(tenantId, (tdb) =>
      completeOrder(tdb, tenantId, orderId, parsed.data.paymentMethod, parsed.data.amountPaid)
    );

    void withTenantDb(tenantId, (tdb) =>
      tdb.update(ordersTable)
        .set({ completionToken: null })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tenantId)))
    ).catch(() => {});

    for (const alert of lowStockAlerts) {
      sseBroker.emit({ type: "inventory:low", data: alert });
    }
    sseBroker.emit({ type: "stats:updated", data: { tenantId } });

    void logAudit(req, "order:completed", "orders", orderId, {
      paymentMethod: parsed.data.paymentMethod,
      amountPaid: String(parsed.data.amountPaid ?? total),
      oldValue: previousStatus,
      newValue: "completed",
      total: String(total),
      source: "qr_public",
    });

    const [order] = await withTenantDb(tenantId, (tdb) =>
      tdb.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status })
        .from(ordersTable)
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tenantId)))
    );

    res.json(order ?? { id: orderId, status: "completed" });
  } catch (err) {
    if (err instanceof OrderNotFoundError) { res.status(404).json({ error: err.message }); return; }
    if (err instanceof OrderAlreadyCompletedError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
});

/**
 * GET /api/public/qr/:token
 * Public endpoint — validates a QR token and returns tenant + table + menu.
 * No auth required. Increments scans_count on successful validation.
 */
router.get("/public/qr/:token", async (req, res): Promise<void> => {
  const token = req.params.token as string;

  if (!token || !token.startsWith("qr_")) {
    res.status(404).json({ error: "رمز QR غير صحيح" });
    return;
  }

  const [qrToken] = await db
    .select()
    .from(qrTokensTable)
    .where(eq(qrTokensTable.token, token));

  if (!qrToken) {
    res.status(404).json({ error: "رمز QR غير صحيح أو انتهت صلاحيته" });
    return;
  }
  if (!qrToken.isActive) {
    res.status(404).json({ error: "رمز QR غير صحيح أو انتهت صلاحيته" });
    return;
  }
  if (qrToken.expiresAt && new Date() > qrToken.expiresAt) {
    res.status(410).json({ error: "انتهت صلاحية هذا الرمز. يرجى طلب رمز جديد." });
    return;
  }

  // ── 5-minute customer session window ──────────────────────────────────
  // Each fresh QR scan starts (or extends) a 5-minute ordering window. Once
  // it expires, the customer is required to rescan a brand-new code.
  const SESSION_MS = 5 * 60 * 1000;
  const now = new Date();
  type QrSessionRow = { session_started_at: Date | null; session_expires_at: Date | null };
  const sessRows = await db.execute(sql`
    SELECT session_started_at, session_expires_at
    FROM qr_tokens WHERE id = ${qrToken.id}
  `);
  const sess = sessRows.rows[0] as QrSessionRow | undefined;
  if (sess?.session_expires_at && new Date(sess.session_expires_at) < now) {
    // Window has elapsed — invalidate this token entirely; customer must rescan.
    await db.execute(sql`
      UPDATE qr_tokens
      SET is_active = FALSE, session_started_at = NULL, session_expires_at = NULL
      WHERE id = ${qrToken.id}
    `);
    res.status(410).json({
      error: "انتهت مهلة الطلب (5 دقائق). الرجاء طلب الكود مرة أخرى من النادل.",
      code: "QR_SESSION_EXPIRED",
    });
    return;
  }
  // Open / refresh the session window
  if (!sess?.session_started_at) {
    await db.execute(sql`
      UPDATE qr_tokens
      SET session_started_at = ${now}, session_expires_at = ${new Date(now.getTime() + SESSION_MS)}
      WHERE id = ${qrToken.id}
    `);
  }

  const tenantId = qrToken.tenantId;
  if (tenantId === null) {
    res.status(500).json({ error: "بيانات QR غير مكتملة" });
    return;
  }

  const [[tenant], [table], menu] = await Promise.all([
    db.select({ id: tenantsTable.id, name: tenantsTable.name, nameAr: tenantsTable.nameAr, currency: tenantsTable.currency, taxRate: tenantsTable.taxRate, settings: tenantsTable.settings })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)),
    db.select({ id: restaurantTablesTable.id, number: restaurantTablesTable.number, capacity: restaurantTablesTable.capacity, section: restaurantTablesTable.section })
      .from(restaurantTablesTable).where(eq(restaurantTablesTable.id, qrToken.tableId)),
    withTenantDb(tenantId, (tdb) =>
      tdb.select({
        id: productsTable.id, name: productsTable.name, description: productsTable.description,
        price: productsTable.price, isActive: productsTable.isActive,
        categoryId: productsTable.categoryId, categoryName: categoriesTable.name,
        categoryColor: categoriesTable.color, imageUrl: productsTable.imageUrl,
        kitchenAvailable: productsTable.kitchenAvailable,
        unavailabilityReason: productsTable.unavailabilityReason,
        optionGroups: productsTable.optionGroups,
      })
      .from(productsTable)
      .leftJoin(categoriesTable, and(eq(productsTable.categoryId, categoriesTable.id), eq(categoriesTable.tenantId, tenantId)))
      .where(and(eq(productsTable.isActive, true), eq(productsTable.tenantId, tenantId)))
    ),
  ]);

  if (!tenant) { res.status(404).json({ error: "Restaurant not found" }); return; }

  void db.update(qrTokensTable)
    .set({ scansCount: qrToken.scansCount + 1, lastScannedAt: new Date() })
    .where(eq(qrTokensTable.id, qrToken.id))
    .catch(() => {});

  const tenantSettings = tenant.settings as { hideUnavailableInQr?: boolean } | null;
  const filteredMenu = tenantSettings?.hideUnavailableInQr
    ? menu.filter((p) => p.kitchenAvailable !== false)
    : menu;

  res.json({
    tenantId,
    tenantName: tenant.name,
    tenantNameAr: tenant.nameAr,
    currency: tenant.currency,
    taxRate: parseFloat(tenant.taxRate),
    tableNumber: table?.number ?? String(qrToken.tableId),
    tableCapacity: table?.capacity ?? null,
    tableSection: table?.section ?? null,
    menu: filteredMenu.map((p) => ({ ...p, price: parseFloat(p.price) })),
  });
});

export default router;
