// Predictive Engine — sales / demand forecasting.
//
// Strategy: hybrid statistical model with optional LLM contextual reasoning.
//
//   1. Pull last-N-days completed orders for the tenant via Drizzle (RLS-safe)
//   2. Build per-product time series (date, hour, quantity, revenue)
//   3. For each product, blend three signals:
//        a) EMA(quantity by day)          → recency-weighted baseline
//        b) Weekly seasonality factor      → adjusts for "Friday is busier"
//        c) Linear regression slope        → trend (rising / stable / falling)
//   4. Confidence score derives from R² and sample size
//   5. Recommended stock = predicted_qty * 1.2  (20% safety buffer)
//   6. (Optional) Call LLM for a 3-5 bullet contextual summary
//
// No Redis, no Python. All math in-process.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import type { createTenantDb } from "@workspace/db";
import { ema, linearRegression, mean, clamp } from "./statistics.js";
import { llmReason, getCached, setCached } from "./llm-client.js";

type Db = ReturnType<typeof createTenantDb>;

// ── Types ──────────────────────────────────────────────────────────────────
export interface ProductPrediction {
  productId: number;
  productName: string;
  categoryId: number;
  /** Forecasted quantity for the target date */
  predictedQuantity: number;
  /** 0..100, blends R² and sample size */
  confidence: number;
  /** Top 3 hours of day where this product sells most */
  peakHours: number[];
  /** Suggested stock = predictedQuantity * 1.2 */
  recommendedStock: number;
  /** Direction of the linear trend */
  trend: "rising" | "stable" | "falling";
  /** Slope (units per day) */
  trendPerDay: number;
  /** Sample size — how many historical days produced this forecast */
  daysOfHistory: number;
}

export interface DailyPrediction {
  date: string;
  totalPredictedOrders: number;
  totalPredictedRevenue: number;
  peakHour: number;
  topProducts: ProductPrediction[];
  staffing: {
    waiters: number;
    kitchenStaff: number;
    cashiers: number;
  };
  averageConfidence: number;
}

export interface InventoryRecommendation {
  productId: number;
  productName: string;
  totalNeededDays: number;
  totalNeededQty: number;
  dailyAverage: number;
  urgency: "high" | "medium" | "low";
  note: string;
}

// ── Internal data shape ────────────────────────────────────────────────────
interface OrderRow {
  productId: number;
  productName: string;
  categoryId: number;
  quantity: number;
  unitPrice: number;
  createdAt: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function isWeekendSA(dayIdx: number): boolean {
  // Saudi weekend: Friday=5, Saturday=6
  return dayIdx === 5 || dayIdx === 6;
}

function pickPeakHours(rows: OrderRow[]): number[] {
  const byHour = new Map<number, number>();
  for (const r of rows) {
    const h = new Date(r.createdAt).getUTCHours();
    byHour.set(h, (byHour.get(h) ?? 0) + r.quantity);
  }
  return [...byHour.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => h);
}

// ── Core forecaster ────────────────────────────────────────────────────────
export class PredictiveEngine {
  /**
   * Forecast per-product demand for `targetDate`.
   * Uses `daysBack` days of history (default 60).
   */
  async predictProductDemand(
    db: Db,
    tenantId: number,
    targetDate: string,
    daysBack = 60,
  ): Promise<ProductPrediction[]> {
    const cacheKey = `predict:${tenantId}:${targetDate}:${daysBack}`;
    const cached = getCached<ProductPrediction[]>(cacheKey);
    if (cached) return cached;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - daysBack * 86400_000);

    const rows = await db
      .select({
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        categoryId: productsTable.categoryId,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
        createdAt: ordersTable.createdAt,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        gte(ordersTable.createdAt, startDate),
        lt(ordersTable.createdAt, endDate),
      ));

    // Group by product
    const byProduct = new Map<number, OrderRow[]>();
    for (const r of rows) {
      const row: OrderRow = {
        productId: r.productId,
        productName: r.productName,
        categoryId: r.categoryId ?? 0,
        quantity: r.quantity,
        unitPrice: Number(r.unitPrice),
        createdAt: r.createdAt,
      };
      const list = byProduct.get(row.productId) ?? [];
      list.push(row);
      byProduct.set(row.productId, list);
    }

    const target = new Date(targetDate + "T00:00:00Z");
    const targetDay = target.getUTCDay();
    const predictions: ProductPrediction[] = [];

    for (const [productId, productRows] of byProduct) {
      // Daily aggregate
      const byDate = new Map<string, number>();
      const byDow = new Map<number, number[]>();
      for (const r of productRows) {
        const d = r.createdAt.toISOString().slice(0, 10);
        byDate.set(d, (byDate.get(d) ?? 0) + r.quantity);
        const dow = r.createdAt.getUTCDay();
        const arr = byDow.get(dow) ?? [];
        arr.push(r.quantity);
        byDow.set(dow, arr);
      }

      const sortedDates = [...byDate.keys()].sort();
      const dailySeries = sortedDates.map((d) => byDate.get(d)!);
      if (dailySeries.length === 0) continue;

      // 1) EMA baseline
      const emaBaseline = ema(dailySeries, 0.3);

      // 2) Weekly seasonality factor
      const dowMean = mean(byDow.get(targetDay) ?? []);
      const globalMean = mean(dailySeries);
      const seasonalFactor = globalMean > 0 && dowMean > 0
        ? clamp(dowMean / globalMean, 0.4, 2.5)
        : 1;

      // 3) Trend (linear regression over daily series)
      const regPoints = dailySeries.map((y, i) => ({ x: i, y }));
      const reg = linearRegression(regPoints);

      // 4) Combined forecast
      const seasonalAdjusted = emaBaseline * seasonalFactor;
      const trendProjection = emaBaseline + reg.slope * 7; // project a week ahead
      const predictedQty = Math.max(
        0,
        Math.round(seasonalAdjusted * 0.7 + trendProjection * 0.3),
      );

      // 5) Trend direction
      let trend: "rising" | "stable" | "falling" = "stable";
      if (reg.slope > 0.3) trend = "rising";
      else if (reg.slope < -0.3) trend = "falling";

      // 6) Confidence: blends R² and history depth
      const sampleBonus = Math.min(25, dailySeries.length); // up to +25 for >=25 days
      const confidence = Math.round(clamp(40 + reg.r2 * 30 + sampleBonus, 30, 95));

      predictions.push({
        productId,
        productName: productRows[0]!.productName,
        categoryId: productRows[0]!.categoryId,
        predictedQuantity: predictedQty,
        confidence,
        peakHours: pickPeakHours(productRows),
        recommendedStock: Math.ceil(predictedQty * 1.2),
        trend,
        trendPerDay: Math.round(reg.slope * 100) / 100,
        daysOfHistory: dailySeries.length,
      });
    }

    predictions.sort((a, b) => b.predictedQuantity - a.predictedQuantity);

    setCached(cacheKey, predictions, 1800); // 30 min
    return predictions;
  }

  /** Aggregated daily forecast: totals + peak hour + staffing. */
  async predictDaily(
    db: Db,
    tenantId: number,
    targetDate: string,
  ): Promise<DailyPrediction> {
    const cacheKey = `predict-daily:${tenantId}:${targetDate}`;
    const cached = getCached<DailyPrediction>(cacheKey);
    if (cached) return cached;

    const productPredictions = await this.predictProductDemand(db, tenantId, targetDate);

    // Need avg unit price per product for revenue estimate
    const productIds = productPredictions.map(p => p.productId);
    let priceById = new Map<number, number>();
    if (productIds.length > 0) {
      const prices = await db
        .select({ id: productsTable.id, price: productsTable.price })
        .from(productsTable)
        .where(eq(productsTable.tenantId, tenantId));
      priceById = new Map(prices.map(p => [p.id, Number(p.price)]));
    }

    const totalRevenue = productPredictions.reduce((s, p) => {
      const price = priceById.get(p.productId) ?? 0;
      return s + p.predictedQuantity * price;
    }, 0);
    const totalOrders = Math.max(1, Math.round(totalRevenue / 75)); // 75 SAR avg ticket fallback

    // Peak hour across all products (weighted)
    const hourScore = new Map<number, number>();
    for (const p of productPredictions) {
      for (let i = 0; i < p.peakHours.length; i++) {
        const h = p.peakHours[i]!;
        // first peak gets full weight, second gets 0.6, third gets 0.3
        const weight = [1, 0.6, 0.3][i] ?? 0.3;
        hourScore.set(h, (hourScore.get(h) ?? 0) + p.predictedQuantity * weight);
      }
    }
    let peakHour = 13;
    let max = 0;
    for (const [h, v] of hourScore) {
      if (v > max) { peakHour = h; max = v; }
    }

    const avgConfidence = productPredictions.length > 0
      ? Math.round(mean(productPredictions.map(p => p.confidence)))
      : 0;

    const result: DailyPrediction = {
      date: targetDate,
      totalPredictedOrders: totalOrders,
      totalPredictedRevenue: Math.round(totalRevenue),
      peakHour,
      topProducts: productPredictions.slice(0, 10),
      staffing: {
        waiters: Math.max(1, Math.ceil(totalOrders / 30)),
        kitchenStaff: Math.max(1, Math.ceil(totalOrders / 40)),
        cashiers: Math.max(1, Math.ceil(totalOrders / 80)),
      },
      averageConfidence: avgConfidence,
    };

    setCached(cacheKey, result, 1800);
    return result;
  }

  /**
   * 7-day (or custom) inventory plan: aggregate quantities needed per product.
   */
  async inventoryPlan(
    db: Db,
    tenantId: number,
    days = 7,
  ): Promise<InventoryRecommendation[]> {
    const cacheKey = `inv-plan:${tenantId}:${days}`;
    const cached = getCached<InventoryRecommendation[]>(cacheKey);
    if (cached) return cached;

    const totals = new Map<number, { name: string; total: number }>();
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const pred = await this.predictProductDemand(db, tenantId, ds);
      for (const p of pred) {
        const cur = totals.get(p.productId) ?? { name: p.productName, total: 0 };
        cur.total += p.predictedQuantity;
        totals.set(p.productId, cur);
      }
    }

    const out: InventoryRecommendation[] = [...totals.entries()]
      .map(([productId, v]) => {
        const dailyAvg = v.total / days;
        const urgency: InventoryRecommendation["urgency"] =
          v.total >= 50 ? "high" : v.total >= 20 ? "medium" : "low";
        return {
          productId,
          productName: v.name,
          totalNeededDays: days,
          totalNeededQty: Math.ceil(v.total * 1.2), // safety buffer
          dailyAverage: Math.round(dailyAvg * 10) / 10,
          urgency,
          note:
            urgency === "high" ? `طلب شراء عاجل — متوسط ${Math.round(dailyAvg)} وحدة/يوم`
              : urgency === "medium" ? `طلب شراء عادي — تأكد من توفر الكمية`
              : `استهلاك منخفض — لا تراكم مخزون`,
        };
      })
      .sort((a, b) => b.totalNeededQty - a.totalNeededQty);

    setCached(cacheKey, out, 3600);
    return out;
  }

  /**
   * LLM-powered contextual narrative — uses Claude (via sidecar) to add
   * business judgement on top of the deterministic forecast. Falls back
   * silently to "" if the sidecar is unavailable.
   */
  async contextualNarrative(
    db: Db,
    tenantId: number,
    targetDate: string,
  ): Promise<string> {
    const cacheKey = `predict-llm:${tenantId}:${targetDate}`;
    const cached = getCached<string>(cacheKey);
    if (cached) return cached;

    const pred = await this.predictDaily(db, tenantId, targetDate);
    const dayName = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][
      new Date(targetDate + "T00:00:00Z").getUTCDay()
    ];
    const weekend = isWeekendSA(new Date(targetDate + "T00:00:00Z").getUTCDay());

    const dataContext = JSON.stringify({
      date: targetDate,
      day: dayName,
      isWeekendSaudi: weekend,
      predictedOrders: pred.totalPredictedOrders,
      predictedRevenueSAR: pred.totalPredictedRevenue,
      peakHour: pred.peakHour,
      averageConfidence: pred.averageConfidence,
      top5Products: pred.topProducts.slice(0, 5).map(p => ({
        name: p.productName,
        qty: p.predictedQuantity,
        trend: p.trend,
      })),
      staffing: pred.staffing,
    }, null, 2);

    const reply = await llmReason({
      dataContext,
      question: `قدّم 4 توصيات تشغيلية محددة لإدارة المطعم ليوم ${targetDate}.
ركز على: (1) تجهيز ساعة الذروة، (2) الموظفين المطلوبين، (3) المنتجات المتراجعة التي تحتاج تنشيط، (4) أي ملاحظة موسمية مهمة.
سطر واحد لكل توصية، بدون أرقام مكررة، بدون مقدمات.`,
      timeoutMs: 18_000,
    });

    setCached(cacheKey, reply, 1800);
    return reply;
  }
}

export const predictiveEngine = new PredictiveEngine();
