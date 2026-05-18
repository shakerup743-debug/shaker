import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";
import {
  ordersTable,
  orderItemsTable,
  inventoryTable,
  kitchenTicketsTable,
  productsTable,
  categoriesTable,
} from "@workspace/db";
import { requireTenant } from "../middleware/require-tenant.js";
import { requirePlan } from "../middleware/require-plan.js";

const router: IRouter = Router();

router.use(requireTenant);

/* ─── date helpers ─── */
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function dayRange(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00Z");
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return { date, next };
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function yearRange(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return { start, end };
}

function trendPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

type TenantDb = NonNullable<Express.Request["db"]>;

/** Single source of truth for the "completed" status string used across all report queries. */
const COMPLETED_STATUS = "completed" as const;

/* ─── shared: top products for a date range ─── */
async function getTopProductsForRange(dbx: TenantDb, tenantId: number, start: Date, end: Date, limit = 10) {
  const completedOrders = await dbx
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      eq(ordersTable.status, COMPLETED_STATUS),
      gte(ordersTable.createdAt, start),
      lt(ordersTable.createdAt, end)
    ));

  if (completedOrders.length === 0) return [];

  const orderIds = completedOrders.map((o) => o.id);
  const allItems = await dbx
    .select()
    .from(orderItemsTable)
    .where(inArray(orderItemsTable.orderId, orderIds));

  const productMap = new Map<number, { productName: string; totalSold: number; totalRevenue: number }>();
  for (const item of allItems) {
    const existing = productMap.get(item.productId) ?? {
      productName: item.productName,
      totalSold: 0,
      totalRevenue: 0,
    };
    existing.totalSold += item.quantity;
    existing.totalRevenue += parseFloat(item.subtotal);
    productMap.set(item.productId, existing);
  }

  return Array.from(productMap.entries())
    .map(([productId, data]) => ({ productId, ...data, categoryName: null }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, limit);
}

/* ─── shared: summary for a set of orders ─── */
function summariseOrders(orders: (typeof ordersTable.$inferSelect)[]) {
  const completed = orders.filter((o) => o.status === COMPLETED_STATUS);
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const totalRevenue = completed.reduce((s, o) => s + parseFloat(o.total), 0);
  const cashRevenue = completed
    .filter((o) => o.paymentMethod === "cash")
    .reduce((s, o) => s + parseFloat(o.total), 0);
  const cardRevenue = completed
    .filter((o) => o.paymentMethod === "card")
    .reduce((s, o) => s + parseFloat(o.total), 0);
  const taxCollected = completed.reduce((s, o) => s + parseFloat(o.tax ?? "0"), 0);
  const discountsGiven = completed.reduce((s, o) => s + parseFloat(o.discount ?? "0"), 0);
  return {
    totalRevenue,
    orderCount: orders.length,
    completedOrders: completed.length,
    cancelledOrders: cancelled.length,
    averageOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
    cashRevenue,
    cardRevenue,
    taxCollected,
    discountsGiven,
    dineInOrders: orders.filter((o) => o.type === "dine_in").length,
    takeawayOrders: orders.filter((o) => o.type === "takeaway").length,
    deliveryOrders: orders.filter((o) => o.type === "delivery").length,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   DASHBOARD — enhanced with trend data
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/dashboard", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const today = todayStr();
  const { date: todayStart, next: todayEnd } = dayRange(today);

  const yesterday = new Date(todayStart);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const weekAgo = new Date(todayStart);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const twoWeeksAgo = new Date(todayStart);
  twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 14);

  const [todayOrders, yesterdayOrders, weekOrders, prevWeekOrders, activeOrders, inventoryItems, pendingTickets] =
    await Promise.all([
      req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, todayStart), lt(ordersTable.createdAt, todayEnd))),
      req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, yesterday), lt(ordersTable.createdAt, todayStart))),
      req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), eq(ordersTable.status, COMPLETED_STATUS), gte(ordersTable.createdAt, weekAgo))),
      req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), eq(ordersTable.status, COMPLETED_STATUS), gte(ordersTable.createdAt, twoWeeksAgo), lt(ordersTable.createdAt, weekAgo))),
      req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), sql`${ordersTable.status} = ANY(ARRAY['pending','preparing','ready'])`)),
      req.db!.select().from(inventoryTable).where(eq(inventoryTable.tenantId, tid)),
      req.db!.select().from(kitchenTicketsTable).where(and(eq(kitchenTicketsTable.tenantId, tid), sql`${kitchenTicketsTable.status} = ANY(ARRAY['new','in_progress'])`)),
    ]);

  const completedToday = todayOrders.filter((o) => o.status === COMPLETED_STATUS);
  const completedYesterday = yesterdayOrders.filter((o) => o.status === COMPLETED_STATUS);

  const todayRevenue = completedToday.reduce((s, o) => s + parseFloat(o.total), 0);
  const yesterdayRevenue = completedYesterday.reduce((s, o) => s + parseFloat(o.total), 0);
  const weekRevenue = weekOrders.reduce((s, o) => s + parseFloat(o.total), 0);
  const prevWeekRevenue = prevWeekOrders.reduce((s, o) => s + parseFloat(o.total), 0);

  const lowStockCount = inventoryItems.filter(
    (i) => parseFloat(i.quantity) <= parseFloat(i.lowStockThreshold)
  ).length;

  res.json({
    todayRevenue,
    todayOrders: todayOrders.length,
    activeOrders: activeOrders.length,
    lowStockCount,
    weekRevenue,
    pendingKitchenTickets: pendingTickets.length,
    yesterdayRevenue,
    yesterdayOrders: yesterdayOrders.length,
    prevWeekRevenue,
    revenueTrend: trendPct(todayRevenue, yesterdayRevenue),
    ordersTrend: trendPct(todayOrders.length, yesterdayOrders.length),
    weekRevenueTrend: trendPct(weekRevenue, prevWeekRevenue),
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   KPIs — comprehensive metrics with period comparison (Pro+)
   GET /reports/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/kpis", requirePlan("pro"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const today = todayStr();
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const to = typeof req.query.to === "string" ? req.query.to : today;

  const { date: start } = dayRange(from);
  const { next: end } = dayRange(to);

  const periodMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - periodMs);
  const prevEnd = new Date(start);

  const [orders, prevOrders, inventoryItems] = await Promise.all([
    req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end))),
    req.db!.select().from(ordersTable).where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, prevStart), lt(ordersTable.createdAt, prevEnd))),
    req.db!.select().from(inventoryTable).where(eq(inventoryTable.tenantId, tid)),
  ]);

  const curr = summariseOrders(orders);
  const prev = summariseOrders(prevOrders);

  const lowStockItems = inventoryItems.filter(
    (i) => parseFloat(i.quantity) <= parseFloat(i.lowStockThreshold)
  );

  const cancellationRate = curr.orderCount > 0
    ? Math.round((curr.cancelledOrders / curr.orderCount) * 100)
    : 0;
  const prevCancellationRate = prev.orderCount > 0
    ? Math.round((prev.cancelledOrders / prev.orderCount) * 100)
    : 0;

  res.json({
    period: { from, to },
    totalRevenue: curr.totalRevenue,
    prevRevenue: prev.totalRevenue,
    revenueTrend: trendPct(curr.totalRevenue, prev.totalRevenue),
    taxCollected: curr.taxCollected,
    discountsGiven: curr.discountsGiven,
    cashRevenue: curr.cashRevenue,
    cardRevenue: curr.cardRevenue,
    orderCount: curr.orderCount,
    prevOrderCount: prev.orderCount,
    ordersTrend: trendPct(curr.orderCount, prev.orderCount),
    completedOrders: curr.completedOrders,
    cancelledOrders: curr.cancelledOrders,
    cancellationRate,
    prevCancellationRate,
    averageOrderValue: curr.averageOrderValue,
    prevAverageOrderValue: prev.averageOrderValue,
    aovTrend: trendPct(curr.averageOrderValue, prev.averageOrderValue),
    dineInOrders: curr.dineInOrders,
    takeawayOrders: curr.takeawayOrders,
    deliveryOrders: curr.deliveryOrders,
    lowStockCount: lowStockItems.length,
    lowStockItems: lowStockItems.slice(0, 5).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: parseFloat(i.quantity),
      threshold: parseFloat(i.lowStockThreshold),
      unit: i.unit,
    })),
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   BY CATEGORY — sales breakdown by product category
   GET /reports/by-category?from=YYYY-MM-DD&to=YYYY-MM-DD
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/by-category", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const today = todayStr();
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const to = typeof req.query.to === "string" ? req.query.to : today;

  const { date: start } = dayRange(from);
  const { next: end } = dayRange(to);

  const completedOrders = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tid), eq(ordersTable.status, COMPLETED_STATUS), gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end)));

  if (completedOrders.length === 0) {
    res.json([]);
    return;
  }

  const orderIds = completedOrders.map((o) => o.id);
  const [items, products, categories] = await Promise.all([
    req.db!.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)),
    req.db!.select().from(productsTable).where(eq(productsTable.tenantId, tid)),
    req.db!.select().from(categoriesTable).where(eq(categoriesTable.tenantId, tid)),
  ]);

  const productCategoryMap = new Map(products.map((p) => [p.id, p.categoryId]));
  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));

  const catMap = new Map<number, { categoryName: string; revenue: number; itemsSold: number; orderCount: Set<number> }>();

  for (const item of items) {
    const catId = productCategoryMap.get(item.productId) ?? -1;
    const catName = categoryNameMap.get(catId) ?? "Uncategorised";
    const existing = catMap.get(catId) ?? { categoryName: catName, revenue: 0, itemsSold: 0, orderCount: new Set() };
    existing.revenue += parseFloat(item.subtotal);
    existing.itemsSold += item.quantity;
    existing.orderCount.add(item.orderId);
    catMap.set(catId, existing);
  }

  const result = Array.from(catMap.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.categoryName,
      revenue: data.revenue,
      itemsSold: data.itemsSold,
      orderCount: data.orderCount.size,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  res.json(result);
});

/* ══════════════════════════════════════════════════════════════════════════
   BY WEEKDAY — sales by day of the week
   GET /reports/by-weekday?from=YYYY-MM-DD&to=YYYY-MM-DD
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/by-weekday", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const today = todayStr();
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const to = typeof req.query.to === "string" ? req.query.to : today;

  const { date: start } = dayRange(from);
  const { next: end } = dayRange(to);

  const orders = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tid), eq(ordersTable.status, COMPLETED_STATUS), gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end)));

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayMap = new Map<number, { revenue: number; orderCount: number }>();
  for (let i = 0; i < 7; i++) weekdayMap.set(i, { revenue: 0, orderCount: 0 });

  for (const o of orders) {
    const day = new Date(o.createdAt).getUTCDay();
    const existing = weekdayMap.get(day)!;
    existing.revenue += parseFloat(o.total);
    existing.orderCount++;
  }

  const result = Array.from(weekdayMap.entries()).map(([weekday, data]) => ({
    weekday,
    dayName: DAY_NAMES[weekday],
    revenue: data.revenue,
    orderCount: data.orderCount,
  }));

  res.json(result);
});

/* ══════════════════════════════════════════════════════════════════════════
   DAILY REPORT
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/daily", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const dateStr = typeof req.query.date === "string" ? req.query.date : todayStr();
  const { date, next } = dayRange(dateStr);

  const orders = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, date), lt(ordersTable.createdAt, next)));

  res.json({ date: dateStr, ...summariseOrders(orders) });
});

/* ══════════════════════════════════════════════════════════════════════════
   TOP PRODUCTS
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/top-products", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const dateStr = typeof req.query.date === "string" ? req.query.date : todayStr();
  const { date, next } = dayRange(dateStr);
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 10;

  res.json(await getTopProductsForRange(req.db!, tid, date, next, limit));
});

/* ══════════════════════════════════════════════════════════════════════════
   HOURLY SALES
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/hourly", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const dateStr = typeof req.query.date === "string" ? req.query.date : todayStr();
  const { date, next } = dayRange(dateStr);

  const orders = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tid), eq(ordersTable.status, COMPLETED_STATUS), gte(ordersTable.createdAt, date), lt(ordersTable.createdAt, next)));

  const hourMap = new Map<number, { orderCount: number; revenue: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { orderCount: 0, revenue: 0 });
  for (const o of orders) {
    const h = new Date(o.createdAt).getUTCHours();
    const existing = hourMap.get(h)!;
    existing.orderCount++;
    existing.revenue += parseFloat(o.total);
  }

  res.json(Array.from(hourMap.entries()).map(([hour, data]) => ({ hour, ...data })));
});

/* ══════════════════════════════════════════════════════════════════════════
   MONTHLY REPORT (Pro+)
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/monthly", requirePlan("pro"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const now = new Date();
  const year = typeof req.query.year === "string" ? parseInt(req.query.year, 10) : now.getUTCFullYear();
  const month = typeof req.query.month === "string" ? parseInt(req.query.month, 10) : now.getUTCMonth() + 1;

  const { start, end } = monthRange(year, month);

  const orders = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end)));

  const summary = summariseOrders(orders);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dailyBreakdown = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayOrders = orders.filter((o) => {
      const ot = new Date(o.createdAt);
      return ot.getUTCFullYear() === year && ot.getUTCMonth() + 1 === month && ot.getUTCDate() === d;
    });
    dailyBreakdown.push({ date: dateStr, ...summariseOrders(dayOrders) });
  }

  const topProducts = await getTopProductsForRange(req.db!, tid, start, end, 10);

  res.json({ year, month, ...summary, dailyBreakdown, topProducts });
});

/* ══════════════════════════════════════════════════════════════════════════
   YEARLY REPORT (Pro+)
══════════════════════════════════════════════════════════════════════════ */
router.get("/reports/yearly", requirePlan("pro"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const now = new Date();
  const year = typeof req.query.year === "string" ? parseInt(req.query.year, 10) : now.getUTCFullYear();

  const { start, end } = yearRange(year);

  const orders = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tid), gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end)));

  const summary = summariseOrders(orders);

  const monthlyBreakdown = [];
  for (let m = 1; m <= 12; m++) {
    const { start: mStart, end: mEnd } = monthRange(year, m);
    const monthOrders = orders.filter((o) => {
      const ot = new Date(o.createdAt);
      return ot >= mStart && ot < mEnd;
    });
    monthlyBreakdown.push({ month: m, ...summariseOrders(monthOrders) });
  }

  const topProducts = await getTopProductsForRange(req.db!, tid, start, end, 10);

  res.json({ year, ...summary, monthlyBreakdown, topProducts });
});

export default router;
