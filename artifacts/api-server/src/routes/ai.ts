import { Router } from "express";
import { eq, and, gte, lt, desc, inArray } from "drizzle-orm";
import {
  db,
  ordersTable, orderItemsTable, inventoryTable, productsTable,
  categoriesTable, customersTable,
} from "@workspace/db";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";

const router = Router();

// All AI routes require a resolved tenant context.
// req.db! is a Drizzle instance bound to a per-request pool connection whose
// app.current_tenant_id session variable is set, satisfying FORCE RLS policies.
router.use(requireTenant);

function todayStr() { return new Date().toISOString().split("T")[0]!; }
function dayRange(d: string) {
  const date = new Date(d + "T00:00:00Z");
  const next = new Date(date); next.setUTCDate(next.getUTCDate() + 1);
  return { date, next };
}

/* ══════════════════════════════════════════════════════
   GET /ai/insights — AI-powered business insights
══════════════════════════════════════════════════════ */
router.get("/ai/insights", authorize("owner", "admin", "area_manager", "branch_manager", "accountant"), async (req, res) => {
  const tenantId = req.tenantId!;
  const days = typeof req.query.days === "string" ? parseInt(req.query.days) : 30;
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  const [orders, inventory, products, categories] = await Promise.all([
    req.db!.select().from(ordersTable)
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, startDate),
        lt(ordersTable.createdAt, endDate),
      )),
    req.db!.select().from(inventoryTable).where(eq(inventoryTable.tenantId, tenantId)),
    req.db!.select().from(productsTable).where(eq(productsTable.tenantId, tenantId)),
    req.db!.select().from(categoriesTable).where(eq(categoriesTable.tenantId, tenantId)),
  ]);

  const completed = orders.filter(o => o.status === "completed");
  const cancelled = orders.filter(o => o.status === "cancelled");
  const totalRevenue = completed.reduce((s, o) => s + parseFloat(o.total), 0);
  const totalTax = completed.reduce((s, o) => s + parseFloat(o.tax ?? "0"), 0);
  const totalDiscount = orders.reduce((s, o) => s + parseFloat(o.discount ?? "0"), 0);
  const avgOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;
  const cancellationRate = orders.length > 0 ? (cancelled.length / orders.length) * 100 : 0;

  const lowStock = inventory.filter(i => parseFloat(i.quantity) <= parseFloat(i.lowStockThreshold));
  const criticalStock = inventory.filter(i => parseFloat(i.quantity) === 0);

  // Peak hours analysis
  const hourMap = new Map<number, number>();
  for (const o of completed) {
    const h = new Date(o.createdAt).getUTCHours();
    hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
  }
  const peakHour = [...hourMap.entries()].sort((a, b) => b[1] - a[1])[0];

  // Order type distribution
  const dineIn = orders.filter(o => o.type === "dine_in").length;
  const takeaway = orders.filter(o => o.type === "takeaway").length;
  const delivery = orders.filter(o => o.type === "delivery").length;

  // Revenue trend: compare first half vs second half of period
  const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);
  const firstHalf = completed.filter(o => new Date(o.createdAt) < midDate);
  const secondHalf = completed.filter(o => new Date(o.createdAt) >= midDate);
  const firstHalfRevenue = firstHalf.reduce((s, o) => s + parseFloat(o.total), 0);
  const secondHalfRevenue = secondHalf.reduce((s, o) => s + parseFloat(o.total), 0);
  const revenueGrowth = firstHalfRevenue > 0 ? ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100 : 0;

  // Generate text insights
  const insights: string[] = [];
  const recommendations: string[] = [];
  const alerts: string[] = [];

  if (revenueGrowth > 10) insights.push(`Revenue grew ${revenueGrowth.toFixed(1)}% in the second half of the period — strong upward trend.`);
  else if (revenueGrowth < -10) {
    insights.push(`Revenue declined ${Math.abs(revenueGrowth).toFixed(1)}% in the second half — investigate root cause.`);
    recommendations.push("Review pricing and consider promotional campaigns to boost sales.");
  }

  if (cancellationRate > 15) {
    alerts.push(`High cancellation rate: ${cancellationRate.toFixed(1)}%. This indicates operational issues.`);
    recommendations.push("Review kitchen workflow and order processing times to reduce cancellations.");
  }

  if (criticalStock.length > 0) alerts.push(`${criticalStock.length} item(s) are completely out of stock: ${criticalStock.slice(0, 3).map(i => i.name).join(", ")}`);
  if (lowStock.length > 0) alerts.push(`${lowStock.length} item(s) are running low on stock and need restocking.`);

  if (avgOrderValue > 0) insights.push(`Average order value: ${avgOrderValue.toFixed(2)} SAR over ${days} days.`);
  if (totalDiscount > 0) {
    const discountPct = totalRevenue > 0 ? (totalDiscount / (totalRevenue + totalDiscount)) * 100 : 0;
    if (discountPct > 10) {
      insights.push(`Discounts represent ${discountPct.toFixed(1)}% of gross revenue.`);
      recommendations.push("Consider reducing discount frequency — high discounts may erode margins.");
    }
  }

  if (peakHour) insights.push(`Peak hour is ${peakHour[0]}:00 with ${peakHour[1]} orders. Staff accordingly.`);

  if (delivery > dineIn && delivery > takeaway) recommendations.push("Delivery is your top order type — optimize delivery packaging and partner channels.");
  else if (dineIn > takeaway && dineIn > delivery) recommendations.push("Dine-in dominates — focus on table turnover speed and in-store upselling.");

  res.json({
    period: { days, from: startDate.toISOString(), to: endDate.toISOString() },
    summary: {
      totalRevenue, totalOrders: orders.length, completedOrders: completed.length,
      cancelledOrders: cancelled.length, cancellationRate: Math.round(cancellationRate),
      avgOrderValue, totalTax, totalDiscount, revenueGrowth: Math.round(revenueGrowth),
    },
    orderTypes: { dineIn, takeaway, delivery },
    inventory: { lowStockCount: lowStock.length, criticalStockCount: criticalStock.length, criticalItems: criticalStock.map(i => ({ id: i.id, name: i.name, unit: i.unit })) },
    peakHour: peakHour ? { hour: peakHour[0], orderCount: peakHour[1] } : null,
    insights, recommendations, alerts,
  });
});

/* ══════════════════════════════════════════════════════
   GET /ai/forecast — Sales forecasting (7-day)
══════════════════════════════════════════════════════ */
router.get("/ai/forecast", authorize("owner", "admin", "area_manager", "accountant"), async (req, res) => {
  const tenantId = req.tenantId!;
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 28 * 24 * 60 * 60 * 1000);

  const orders = await req.db!.select().from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, startDate),
    ));

  // Group by weekday and compute averages
  const weekdayRevenue = new Map<number, number[]>();
  const weekdayOrders = new Map<number, number[]>();
  for (let i = 0; i < 7; i++) { weekdayRevenue.set(i, []); weekdayOrders.set(i, []); }

  const dayMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const d = new Date(o.createdAt).toISOString().split("T")[0]!;
    const existing = dayMap.get(d) ?? { revenue: 0, orders: 0 };
    existing.revenue += parseFloat(o.total);
    existing.orders++;
    dayMap.set(d, existing);
  }

  for (const [dateStr, data] of dayMap) {
    const wd = new Date(dateStr).getUTCDay();
    weekdayRevenue.get(wd)!.push(data.revenue);
    weekdayOrders.get(wd)!.push(data.orders);
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const forecast = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(endDate.getTime() + i * 24 * 60 * 60 * 1000);
    const wd = d.getUTCDay();
    const predictedRevenue = avg(weekdayRevenue.get(wd) ?? []);
    const predictedOrders = avg(weekdayOrders.get(wd) ?? []);
    const confidence = (weekdayRevenue.get(wd)?.length ?? 0) >= 3 ? "high" : (weekdayRevenue.get(wd)?.length ?? 0) >= 1 ? "medium" : "low";
    forecast.push({
      date: d.toISOString().split("T")[0],
      dayName: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][wd],
      predictedRevenue: Math.round(predictedRevenue),
      predictedOrders: Math.round(predictedOrders),
      confidence,
    });
  }

  const totalForecast = forecast.reduce((s, f) => s + f.predictedRevenue, 0);
  res.json({ forecast, weekTotalForecast: totalForecast, basedOnDays: dayMap.size });
});

/* ══════════════════════════════════════════════════════
   GET /ai/top-performers — Products + customers analysis
══════════════════════════════════════════════════════ */
router.get("/ai/top-performers", authorize("owner", "admin", "area_manager", "branch_manager", "accountant"), async (req, res) => {
  const tenantId = req.tenantId!;
  const days = typeof req.query.days === "string" ? parseInt(req.query.days) : 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const completed = await req.db!.select().from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, startDate),
    ));

  if (completed.length === 0) { res.json({ products: [], customers: [] }); return; }

  const orderIds = completed.map(o => o.id);
  // order_items has no tenant_id; isolation is guaranteed by filtering through
  // tenant-scoped completed order IDs.  customers table has no tenant_id column
  // (cross-tenant reference); global db is used since customers table has no RLS.
  const [items, customers] = await Promise.all([
    req.db!.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds)),
    db.select().from(customersTable).orderBy(desc(customersTable.totalSpent)).limit(10),
  ]);

  // Top products
  const productMap = new Map<number, { name: string; sold: number; revenue: number }>();
  for (const item of items) {
    const ex = productMap.get(item.productId) ?? { name: item.productName, sold: 0, revenue: 0 };
    ex.sold += item.quantity;
    ex.revenue += parseFloat(item.subtotal);
    productMap.set(item.productId, ex);
  }

  const topProducts = [...productMap.entries()]
    .map(([id, d]) => ({ productId: id, ...d }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Bottom products (least sold active products in this tenant)
  const allProducts = await req.db!.select().from(productsTable)
    .where(and(eq(productsTable.isActive, true), eq(productsTable.tenantId, tenantId)));
  const soldIds = new Set(productMap.keys());
  const neverSold = allProducts.filter(p => !soldIds.has(p.id)).map(p => ({ productId: p.id, name: p.name, sold: 0, revenue: 0 }));
  const bottomProducts = [...productMap.entries()]
    .map(([id, d]) => ({ productId: id, ...d }))
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 5)
    .concat(neverSold.slice(0, 5));

  res.json({
    topProducts,
    bottomProducts,
    topCustomers: customers.map(c => ({
      id: c.id, name: c.name, phone: c.phone,
      totalOrders: c.totalOrders, totalSpent: parseFloat(c.totalSpent),
      loyaltyTier: c.loyaltyTier, loyaltyPoints: c.loyaltyPoints,
    })),
    period: { days },
  });
});

/* ══════════════════════════════════════════════════════
   GET /ai/inventory-health — Inventory intelligence
══════════════════════════════════════════════════════ */
router.get("/ai/inventory-health", authorize("owner", "admin", "area_manager", "inventory_manager", "branch_manager"), async (req, res) => {
  const tenantId = req.tenantId!;
  const items = await req.db!.select().from(inventoryTable)
    .where(eq(inventoryTable.tenantId, tenantId));

  const analysis = items.map(item => {
    const qty = parseFloat(item.quantity);
    const threshold = parseFloat(item.lowStockThreshold);
    const ratio = threshold > 0 ? qty / threshold : qty;
    let status: string, urgency: string, daysUntilEmpty: number | null = null;

    if (qty === 0) { status = "out_of_stock"; urgency = "critical"; }
    else if (ratio <= 0.5) { status = "critical"; urgency = "high"; daysUntilEmpty = Math.floor(qty / (threshold / 7)); }
    else if (ratio <= 1) { status = "low"; urgency = "medium"; daysUntilEmpty = Math.floor(qty / (threshold / 14)); }
    else if (ratio <= 2) { status = "adequate"; urgency = "low"; }
    else { status = "well_stocked"; urgency = "none"; }

    return {
      id: item.id, name: item.name, unit: item.unit,
      quantity: qty, threshold, ratio: Math.round(ratio * 100) / 100,
      status, urgency, daysUntilEmpty,
      recommendation: status === "out_of_stock" ? "Order immediately" :
        status === "critical" ? "Order within 24 hours" :
        status === "low" ? "Schedule reorder soon" : null,
    };
  });

  const byUrgency = {
    critical: analysis.filter(i => i.urgency === "critical" || i.urgency === "high"),
    medium: analysis.filter(i => i.urgency === "medium"),
    healthy: analysis.filter(i => i.urgency === "low" || i.urgency === "none"),
  };

  res.json({ items: analysis, summary: byUrgency, totalItems: items.length });
});

/* ══════════════════════════════════════════════════════
   GET /ai/financial-summary — P&L overview
══════════════════════════════════════════════════════ */
router.get("/ai/financial-summary", authorize("owner", "admin", "accountant", "area_manager"), async (req, res) => {
  const tenantId = req.tenantId!;
  const year = typeof req.query.year === "string" ? parseInt(req.query.year) : new Date().getUTCFullYear();
  const startDate = new Date(Date.UTC(year, 0, 1));
  const endDate = new Date(Date.UTC(year + 1, 0, 1));

  const orders = await req.db!.select().from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      gte(ordersTable.createdAt, startDate),
      lt(ordersTable.createdAt, endDate),
    ));

  const completed = orders.filter(o => o.status === "completed");
  const cancelled = orders.filter(o => o.status === "cancelled");

  const grossRevenue = completed.reduce((s, o) => s + parseFloat(o.total), 0);
  const totalTax = completed.reduce((s, o) => s + parseFloat(o.tax ?? "0"), 0);
  const totalDiscount = orders.reduce((s, o) => s + parseFloat(o.discount ?? "0"), 0);
  const netRevenue = grossRevenue - totalTax;

  // Monthly breakdown
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const mStart = new Date(Date.UTC(year, m - 1, 1));
    const mEnd = new Date(Date.UTC(year, m, 1));
    const mOrders = completed.filter(o => { const d = new Date(o.createdAt); return d >= mStart && d < mEnd; });
    const mCancelled = cancelled.filter(o => { const d = new Date(o.createdAt); return d >= mStart && d < mEnd; });
    const mRevenue = mOrders.reduce((s, o) => s + parseFloat(o.total), 0);
    const mTax = mOrders.reduce((s, o) => s + parseFloat(o.tax ?? "0"), 0);
    const mDiscount = [...orders].filter(o => { const d = new Date(o.createdAt); return d >= mStart && d < mEnd; }).reduce((s, o) => s + parseFloat(o.discount ?? "0"), 0);
    monthly.push({
      month: m, monthName: new Date(Date.UTC(year, m - 1)).toLocaleString("en-US", { month: "long" }),
      revenue: mRevenue, tax: mTax, discount: mDiscount, netRevenue: mRevenue - mTax,
      orders: mOrders.length, cancelledOrders: mCancelled.length,
      avgOrderValue: mOrders.length > 0 ? mRevenue / mOrders.length : 0,
    });
  }

  // Payment method breakdown
  const cashRevenue = completed.filter(o => o.paymentMethod === "cash").reduce((s, o) => s + parseFloat(o.total), 0);
  const cardRevenue = completed.filter(o => o.paymentMethod === "card").reduce((s, o) => s + parseFloat(o.total), 0);
  const mixedRevenue = completed.filter(o => o.paymentMethod === "mixed").reduce((s, o) => s + parseFloat(o.total), 0);

  res.json({
    year,
    grossRevenue, netRevenue, totalTax, totalDiscount,
    totalOrders: orders.length, completedOrders: completed.length, cancelledOrders: cancelled.length,
    avgOrderValue: completed.length > 0 ? grossRevenue / completed.length : 0,
    paymentBreakdown: { cash: cashRevenue, card: cardRevenue, mixed: mixedRevenue },
    monthly,
    vatSummary: {
      totalInclusiveTax: totalTax,
      effectiveRate: grossRevenue > 0 ? (totalTax / grossRevenue) * 100 : 0,
    },
  });
});

export default router;
