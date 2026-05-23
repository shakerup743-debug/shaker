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
import {
  fingerprintHash,
  validateSaudiPhone,
  calculateRiskScore,
  sendWhatsAppOtp,
  verifyWhatsAppOtp,
} from "../lib/qr-security.js";
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

    // ── FRAUD-DETECTION LAYER ──────────────────────────────────────────────
    // Customer name + Saudi phone are MANDATORY for QR orders.
    // We score the order, store the audit row, and surface the decision.
    let securityResp: Record<string, unknown> | null = null;
    if (qrToken && qrToken.startsWith("qr_")) {
      if (!customerName || !customerPhone) {
        res.status(400).json({ error: "اسم ورقم الجوال إجباريان لطلبات QR", code: "IDENTITY_REQUIRED" });
        return;
      }
      const phoneCheck = validateSaudiPhone(customerPhone);
      if (!phoneCheck.ok) {
        res.status(400).json({ error: phoneCheck.error, code: "PHONE_INVALID" });
        return;
      }
      const normalizedPhone = phoneCheck.normalized!;

      const { fp, ip } = extractScanCtx(req);
      const scanIdFromBody = Number((req.body as { scanId?: number }).scanId) || null;

      const risk = await calculateRiskScore(
        pool,
        {
          tenantId, qrToken, deviceFingerprint: fp, ipAddress: ip,
          scannedAt: new Date(), tableNumber,
        },
        {
          customerName, customerPhone: normalizedPhone,
          itemsCount: itemsToInsert.length, total: total,
        },
      );

      const secStatus =
        risk.shouldBlock          ? "blocked" :
        risk.requiresApproval     ? "pending_approval" :
        risk.requiresOtp          ? "pending_otp" :
                                    "accepted";

      const secIns = await pool.query(
        `INSERT INTO qr_order_security
           (tenant_id, order_id, qr_scan_id, customer_name, customer_phone,
            device_fingerprint, ip_address, fraud_score, fraud_flags,
            risk_level, otp_required, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, order.id, scanIdFromBody, customerName, normalizedPhone,
         fp, ip, risk.score, risk.flags, risk.riskLevel, risk.requiresOtp, secStatus],
      );
      const orderSecId = secIns.rows[0].id as number;

      // Record fraud_attempts row for high+ risk scores so the dashboard surfaces it.
      if (risk.score >= 40) {
        await pool.query(
          `INSERT INTO fraud_attempts
             (tenant_id, detection_type, qr_token, device_fingerprint, ip_address,
              phone_number, fraud_score, severity, action_taken, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [tenantId, risk.flags.join(",") || "risk_score_high", qrToken, fp, ip,
           normalizedPhone, risk.score, risk.riskLevel,
           risk.shouldBlock ? "blocked" : risk.requiresApproval ? "requires_approval" : "requires_otp",
           { orderId: order.id, orderSecId, total }],
        );
      }

      // If critical, auto-blacklist the device + phone for 24h (soft-block; can be reversed).
      if (risk.shouldBlock) {
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        for (const [type, value] of [["phone", normalizedPhone], ["device_fingerprint", fp]] as const) {
          await pool.query(
            `INSERT INTO security_blacklist (tenant_id, blacklist_type, value, reason, expires_at)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, blacklist_type, value) DO NOTHING`,
            [tenantId, type, value, "auto: critical fraud score", expires],
          );
        }
        await tdb.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, order.id));
        res.status(403).json({
          error: "محاولة طلب مريبة - تم رفض الطلب", code: "FRAUD_BLOCKED",
          orderSecId, fraudScore: risk.score, flags: risk.flags,
        });
        return;
      }

      // Send OTP if needed (also when approval is required, so user can re-verify identity)
      if (risk.requiresOtp) {
        const otp = await sendWhatsAppOtp({
          pool, tenantId, phoneNumber: normalizedPhone, orderSecId,
        });
        securityResp = {
          requiresOtp: true,
          requiresApproval: risk.requiresApproval,
          orderSecId,
          otpExpiresAt: otp.expiresAtIso,
          fraudScore: risk.score,
          riskLevel: risk.riskLevel,
        };
      } else {
        securityResp = {
          requiresOtp: false, requiresApproval: false,
          orderSecId, fraudScore: risk.score, riskLevel: risk.riskLevel,
        };
      }
    }

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
      ...(securityResp ?? {}),
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

// ─────────────────────────────────────────────────────────────────────────────
//  QR-SECURITY  ENDPOINTS
//  • POST /public/qr/scan            — record a scan, return scan_id
//  • POST /public/qr/otp/verify      — confirm OTP for a pending order
//  • POST /public/qr/otp/resend      — resend a fresh OTP
//  Admin (authenticated):
//  • GET  /admin/fraud/attempts      — list recent fraud attempts
//  • GET  /admin/fraud/stats         — counters for the dashboard
//  • GET  /admin/fraud/pending       — orders pending cashier approval
//  • POST /admin/fraud/orders/:id/approve   — cashier accepts
//  • POST /admin/fraud/orders/:id/reject    — cashier rejects + blacklist
//  • POST /admin/fraud/blacklist             — add to blacklist
// ─────────────────────────────────────────────────────────────────────────────

function extractScanCtx(req: Request) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    fp: fingerprintHash({
      userAgent: req.headers["user-agent"] ?? null,
      acceptLanguage: req.headers["accept-language"] as string | undefined,
      timezone: body.timezone as string | undefined,
      screenResolution: body.screenResolution as string | undefined,
      clientHints: (body.clientHints as Record<string, unknown>) ?? {},
    }),
    ip: (req.ip ?? req.socket?.remoteAddress ?? "0.0.0.0").replace(/^::ffff:/, ""),
    ua: (req.headers["user-agent"] ?? "").slice(0, 500),
  };
}

router.post("/public/qr/scan", async (req, res): Promise<void> => {
  const tenantId = await resolveTenant(req, res);
  if (tenantId == null) return;

  const qrToken = (req.body as { qrToken?: string }).qrToken;
  if (!qrToken) { res.status(400).json({ error: "qrToken required" }); return; }

  // Validate token is active
  const r = await db.execute(sql`
    SELECT t.token, t.table_id, rt.number AS table_number, t.is_active, t.session_expires_at
    FROM qr_tokens t LEFT JOIN restaurant_tables rt ON rt.id = t.table_id
    WHERE t.token = ${qrToken} LIMIT 1
  `);
  const tok = r.rows[0] as { token: string; table_id: number; table_number: string | null; is_active: boolean; session_expires_at: Date | null } | undefined;
  if (!tok || !tok.is_active) { res.status(410).json({ error: "QR_INVALID" }); return; }

  const { fp, ip, ua } = extractScanCtx(req);

  const ins = await pool.query(
    `INSERT INTO qr_scans (tenant_id, qr_token, table_number, device_fingerprint, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [tenantId, qrToken, tok.table_number, fp, ip, ua],
  );

  res.json({
    scanId: ins.rows[0].id,
    deviceFingerprint: fp,
    tableId: tok.table_id,
    tableNumber: tok.table_number,
  });
});

router.post("/public/qr/otp/verify", async (req, res): Promise<void> => {
  const { orderSecId, code, phoneNumber } = (req.body ?? {}) as { orderSecId?: number; code?: string; phoneNumber?: string };
  if (!orderSecId || !code || !phoneNumber) {
    res.status(400).json({ error: "orderSecId, code, phoneNumber required" });
    return;
  }
  const phoneCheck = validateSaudiPhone(phoneNumber);
  if (!phoneCheck.ok) { res.status(400).json({ error: phoneCheck.error }); return; }

  const v = await verifyWhatsAppOtp({ pool, phoneNumber: phoneCheck.normalized!, code, orderSecId });
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }

  // Return updated security row so client can branch (accepted vs pending_approval)
  const sec = await pool.query(
    `SELECT status, risk_level, order_id FROM qr_order_security WHERE id = $1`,
    [orderSecId],
  );
  res.json({
    ok: true,
    orderSecId,
    status: sec.rows[0]?.status,
    orderId: sec.rows[0]?.order_id,
  });
});

router.post("/public/qr/otp/resend", async (req, res): Promise<void> => {
  const { orderSecId } = (req.body ?? {}) as { orderSecId?: number };
  if (!orderSecId) { res.status(400).json({ error: "orderSecId required" }); return; }
  const sec = await pool.query(
    `SELECT id, tenant_id, customer_phone, status FROM qr_order_security WHERE id = $1`,
    [orderSecId],
  );
  if (!sec.rowCount) { res.status(404).json({ error: "Order not found" }); return; }
  if (sec.rows[0].status === "accepted" || sec.rows[0].status === "rejected") {
    res.status(409).json({ error: "Order already resolved" });
    return;
  }
  const otp = await sendWhatsAppOtp({
    pool, tenantId: sec.rows[0].tenant_id, phoneNumber: sec.rows[0].customer_phone, orderSecId: sec.rows[0].id,
  });
  res.json({ ok: true, expiresAt: otp.expiresAtIso });
});

// ── Admin fraud dashboard endpoints ────────────────────────────────────────
// These are mounted under the authenticated router via `authenticate`.
import { authenticate } from "../middleware/authenticate.js";
import { requireTenant } from "../middleware/require-tenant.js";

const adminRouter: IRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requireTenant);

adminRouter.get("/admin/fraud/stats", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const [today, blocked, pending] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM fraud_attempts WHERE tenant_id = $1 AND detected_at > CURRENT_DATE`, [t]),
    pool.query(`SELECT COUNT(*)::int AS c FROM security_blacklist WHERE tenant_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`, [t]),
    pool.query(`SELECT COUNT(*)::int AS c FROM qr_order_security WHERE tenant_id = $1 AND status = 'pending_approval'`, [t]),
  ]);
  res.json({
    todayAttempts: today.rows[0].c,
    blockedEntries: blocked.rows[0].c,
    pendingApproval: pending.rows[0].c,
  });
});

adminRouter.get("/admin/fraud/attempts", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const r = await pool.query(
    `SELECT id, detection_type, qr_token, device_fingerprint, ip_address::text AS ip_address,
            phone_number, fraud_score, severity, action_taken, metadata, detected_at
     FROM fraud_attempts WHERE tenant_id = $1 ORDER BY detected_at DESC LIMIT $2`,
    [t, limit],
  );
  res.json(r.rows);
});

adminRouter.get("/admin/fraud/pending", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const r = await pool.query(
    `SELECT qos.id, qos.order_id, qos.customer_name, qos.customer_phone, qos.fraud_score,
            qos.fraud_flags, qos.risk_level, qos.status, qos.created_at,
            o.order_number, o.total::float AS total
     FROM qr_order_security qos
     LEFT JOIN orders o ON o.id = qos.order_id
     WHERE qos.tenant_id = $1 AND qos.status = 'pending_approval'
     ORDER BY qos.created_at DESC`,
    [t],
  );
  res.json(r.rows);
});

adminRouter.post("/admin/fraud/orders/:id/approve", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const userId = (req as Request & { user?: { sub?: number } }).user?.sub ?? null;
  const id = parseInt(String(req.params.id), 10);
  await pool.query(
    `UPDATE qr_order_security
     SET status = 'accepted', cashier_approval = true, cashier_approved_by = $1, cashier_approved_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [userId, id, t],
  );
  res.json({ ok: true });
});

adminRouter.post("/admin/fraud/orders/:id/reject", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const userId = (req as Request & { user?: { sub?: number } }).user?.sub ?? null;
  const id = parseInt(String(req.params.id), 10);
  const reason = ((req.body as { reason?: string })?.reason ?? "rejected by cashier").slice(0, 200);
  const sec = await pool.query(`SELECT customer_phone, device_fingerprint FROM qr_order_security WHERE id = $1 AND tenant_id = $2`, [id, t]);
  if (sec.rowCount) {
    // Auto-blacklist phone + device for 7 days
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    for (const [type, value] of [["phone", sec.rows[0].customer_phone], ["device_fingerprint", sec.rows[0].device_fingerprint]] as const) {
      await pool.query(
        `INSERT INTO security_blacklist (tenant_id, blacklist_type, value, reason, blocked_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, blacklist_type, value) DO NOTHING`,
        [t, type, value, reason, userId, expires],
      );
    }
  }
  await pool.query(
    `UPDATE qr_order_security
     SET status = 'rejected', cashier_approval = false, cashier_approved_by = $1, cashier_approved_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [userId, id, t],
  );
  res.json({ ok: true });
});

adminRouter.get("/admin/fraud/blacklist", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const r = await pool.query(
    `SELECT id, blacklist_type, value, reason, blocked_at, expires_at
     FROM security_blacklist WHERE tenant_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY blocked_at DESC LIMIT 200`,
    [t],
  );
  res.json(r.rows);
});

adminRouter.post("/admin/fraud/blacklist", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  const userId = (req as Request & { user?: { sub?: number } }).user?.sub ?? null;
  const { blacklistType, value, reason, expiresInDays } = (req.body ?? {}) as { blacklistType?: string; value?: string; reason?: string; expiresInDays?: number };
  if (!blacklistType || !value) { res.status(400).json({ error: "blacklistType and value required" }); return; }
  if (!["qr_token", "ip_address", "device_fingerprint", "phone"].includes(blacklistType)) {
    res.status(400).json({ error: "Invalid blacklistType" }); return;
  }
  const expires = expiresInDays && expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86400_000) : null;
  await pool.query(
    `INSERT INTO security_blacklist (tenant_id, blacklist_type, value, reason, blocked_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, blacklist_type, value) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at`,
    [t, blacklistType, value, reason ?? null, userId, expires],
  );
  res.json({ ok: true });
});

adminRouter.delete("/admin/fraud/blacklist/:id", async (req, res): Promise<void> => {
  const t = req.tenantId!;
  await pool.query(`DELETE FROM security_blacklist WHERE id = $1 AND tenant_id = $2`, [parseInt(String(req.params.id), 10), t]);
  res.json({ ok: true });
});

router.use(adminRouter);

export default router;
