// Anomaly Detection Engine — statistical + LLM-augmented financial/fraud alerts.
//
// Scope (MVP): detect 4 high-value anomalies from existing tables only.
//
//   1. Revenue anomaly         — today's revenue z-score vs last 30 days.
//   2. Cancellation spike      — today's cancel rate > μ+2σ.
//   3. Discount abuse          — same cashier issued > 3σ discounts vs peers.
//   4. High-value low-margin   — orders with discount > 30% of subtotal.
//
// Each finding has a deterministic statistical core; LLM is invoked only to
// generate a concise human-readable explanation for the top findings.

import { and, eq, gte, lt, sql, desc } from "drizzle-orm";
import { ordersTable, orderItemsTable } from "@workspace/db";
import type { createTenantDb } from "@workspace/db";
import { mean, stdev, zScore } from "./statistics.js";
import { llmReason, getCached, setCached } from "./llm-client.js";

type Db = ReturnType<typeof createTenantDb>;

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface Anomaly {
  id: string;
  type:
    | "revenue_spike" | "revenue_drop"
    | "cancellation_spike"
    | "discount_abuse"
    | "high_discount_order";
  severity: AnomalySeverity;
  title: string;
  description: string;
  /** Raw numeric "how anomalous" — abs(z-score) usually */
  score: number;
  metrics: Record<string, number | string>;
  /** ISO timestamp the anomaly was detected */
  detectedAt: string;
}

export interface AnomalyReport {
  generatedAt: string;
  totalAnomalies: number;
  anomalies: Anomaly[];
  /** Optional LLM-written summary, may be empty if sidecar unavailable */
  narrative: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function severityFromZ(z: number): AnomalySeverity {
  const a = Math.abs(z);
  if (a >= 3) return "critical";
  if (a >= 2.5) return "high";
  if (a >= 2) return "medium";
  return "low";
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ── Engine ─────────────────────────────────────────────────────────────────
export class AnomalyDetectionEngine {
  /**
   * Build a full anomaly report for the tenant.
   * Looks at the last 30 days for baselines and the last 24h for findings.
   */
  async detect(db: Db, tenantId: number): Promise<AnomalyReport> {
    const cacheKey = `anomaly:${tenantId}`;
    const cached = getCached<AnomalyReport>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const baselineStart = new Date(now.getTime() - 30 * 86400_000);
    const todayStart = startOfDayUTC(now);

    // Load all orders for the last 30 days
    const orders = await db
      .select({
        id: ordersTable.id,
        status: ordersTable.status,
        total: ordersTable.total,
        subtotal: ordersTable.subtotal,
        discount: ordersTable.discount,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, baselineStart),
      ));

    const findings: Anomaly[] = [];

    // ── 1) Revenue anomaly (today vs prior 30 days) ───────────────────────
    const dailyRevenue = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "completed") continue;
      const d = o.createdAt.toISOString().slice(0, 10);
      dailyRevenue.set(d, (dailyRevenue.get(d) ?? 0) + Number(o.total));
    }
    const dailyValues = [...dailyRevenue.values()];
    const todayKey = todayStart.toISOString().slice(0, 10);
    const todayRevenue = dailyRevenue.get(todayKey) ?? 0;
    if (dailyValues.length >= 5) {
      const baseline = dailyValues.filter(v => v !== todayRevenue || dailyValues.length === 1);
      const z = zScore(todayRevenue, baseline);
      if (Math.abs(z) >= 1.8) {
        findings.push({
          id: `revenue-${todayKey}`,
          type: z > 0 ? "revenue_spike" : "revenue_drop",
          severity: severityFromZ(z),
          title: z > 0
            ? "ارتفاع غير اعتيادي في الإيرادات اليوم"
            : "انخفاض ملحوظ في الإيرادات اليوم",
          description: z > 0
            ? `إيرادات اليوم ${Math.round(todayRevenue)} ر.س، أعلى من متوسط آخر 30 يوم بـ ${z.toFixed(1)} انحراف معياري.`
            : `إيرادات اليوم ${Math.round(todayRevenue)} ر.س، أقل من المتوسط بـ ${Math.abs(z).toFixed(1)} انحراف معياري. تحقق من سبب الانخفاض.`,
          score: Math.abs(z),
          metrics: {
            today: Math.round(todayRevenue),
            mean30d: Math.round(mean(baseline)),
            stdev30d: Math.round(stdev(baseline)),
            zScore: Math.round(z * 100) / 100,
          },
          detectedAt: now.toISOString(),
        });
      }
    }

    // ── 2) Cancellation spike (today's cancel rate vs baseline) ───────────
    const dailyCancelRate = new Map<string, { total: number; cancelled: number }>();
    for (const o of orders) {
      const d = o.createdAt.toISOString().slice(0, 10);
      const cur = dailyCancelRate.get(d) ?? { total: 0, cancelled: 0 };
      cur.total++;
      if (o.status === "cancelled") cur.cancelled++;
      dailyCancelRate.set(d, cur);
    }
    const rates: number[] = [];
    let todayCancelTotal = 0, todayCancelled = 0;
    for (const [d, v] of dailyCancelRate) {
      if (v.total === 0) continue;
      const r = (v.cancelled / v.total) * 100;
      if (d === todayKey) { todayCancelTotal = v.total; todayCancelled = v.cancelled; }
      else rates.push(r);
    }
    if (rates.length >= 5 && todayCancelTotal > 0) {
      const todayRate = (todayCancelled / todayCancelTotal) * 100;
      const z = zScore(todayRate, rates);
      if (z >= 1.8 && todayRate >= 5) {
        findings.push({
          id: `cancel-${todayKey}`,
          type: "cancellation_spike",
          severity: severityFromZ(z),
          title: "ارتفاع غير اعتيادي في الطلبات الملغاة",
          description: `نسبة الإلغاء اليوم ${todayRate.toFixed(1)}% من ${todayCancelTotal} طلب — أعلى من المتوسط الطبيعي. تحقق من المطبخ والشكاوى.`,
          score: Math.abs(z),
          metrics: {
            todayRatePct: Math.round(todayRate * 10) / 10,
            avgRatePct: Math.round(mean(rates) * 10) / 10,
            cancelled: todayCancelled,
            total: todayCancelTotal,
            zScore: Math.round(z * 100) / 100,
          },
          detectedAt: now.toISOString(),
        });
      }
    }

    // ── 3) High-discount individual orders (>30% off) ─────────────────────
    const todayOrders = orders.filter(o =>
      o.createdAt >= todayStart && Number(o.subtotal) > 0
    );
    const heavyDiscount = todayOrders.filter(o => {
      const sub = Number(o.subtotal);
      const disc = Number(o.discount);
      return sub > 0 && disc / sub >= 0.3;
    });
    if (heavyDiscount.length >= 1) {
      const ratios = heavyDiscount.map(o => Number(o.discount) / Number(o.subtotal));
      const maxRatio = Math.max(...ratios);
      const sev: AnomalySeverity = heavyDiscount.length >= 5
        ? "high" : heavyDiscount.length >= 3 ? "medium" : "low";
      findings.push({
        id: `discount-orders-${todayKey}`,
        type: "high_discount_order",
        severity: sev,
        title: `${heavyDiscount.length} طلب اليوم بخصم ≥ 30%`,
        description: `راجع هذه الطلبات للتأكد من صحة الخصم. أعلى نسبة خصم: ${Math.round(maxRatio * 100)}%.`,
        score: heavyDiscount.length,
        metrics: {
          countToday: heavyDiscount.length,
          maxDiscountPct: Math.round(maxRatio * 100),
          totalDiscountedRevenue: Math.round(heavyDiscount.reduce((s, o) => s + Number(o.total), 0)),
        },
        detectedAt: now.toISOString(),
      });
    }

    // ── 4) Discount abuse pattern (overall discount ratio anomalous) ──────
    const dailyDiscountRatio = new Map<string, number[]>();
    for (const o of orders) {
      if (Number(o.subtotal) === 0) continue;
      const d = o.createdAt.toISOString().slice(0, 10);
      const ratio = Number(o.discount) / Number(o.subtotal);
      const list = dailyDiscountRatio.get(d) ?? [];
      list.push(ratio);
      dailyDiscountRatio.set(d, list);
    }
    const dailyAvgDiscount: number[] = [];
    let todayAvgDiscount = 0;
    for (const [d, ratios] of dailyDiscountRatio) {
      if (ratios.length === 0) continue;
      const avg = mean(ratios);
      if (d === todayKey) todayAvgDiscount = avg;
      else dailyAvgDiscount.push(avg);
    }
    if (dailyAvgDiscount.length >= 5 && todayAvgDiscount > 0) {
      const z = zScore(todayAvgDiscount, dailyAvgDiscount);
      if (z >= 2) {
        findings.push({
          id: `discount-pattern-${todayKey}`,
          type: "discount_abuse",
          severity: severityFromZ(z),
          title: "نمط خصومات غير اعتيادي اليوم",
          description: `متوسط نسبة الخصم اليوم ${(todayAvgDiscount * 100).toFixed(1)}% — أعلى بشكل ملحوظ عن الأيام السابقة. راجع سياسة الخصم.`,
          score: Math.abs(z),
          metrics: {
            todayAvgPct: Math.round(todayAvgDiscount * 1000) / 10,
            baselineAvgPct: Math.round(mean(dailyAvgDiscount) * 1000) / 10,
            zScore: Math.round(z * 100) / 100,
          },
          detectedAt: now.toISOString(),
        });
      }
    }

    findings.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      return order[a.severity] - order[b.severity] || b.score - a.score;
    });

    // ── LLM narrative for top 5 ───────────────────────────────────────────
    let narrative = "";
    if (findings.length > 0) {
      narrative = await llmReason({
        dataContext: JSON.stringify(findings.slice(0, 5), null, 2),
        question: `لخّص هذه التنبيهات في 3-4 أسطر باللغة العربية، مع أولوية واضحة وإجراء مقترح لكل تنبيه عالي/حرج. لا تكرر الأرقام كما هي.`,
        timeoutMs: 15_000,
      });
    }

    const report: AnomalyReport = {
      generatedAt: now.toISOString(),
      totalAnomalies: findings.length,
      anomalies: findings,
      narrative,
    };

    setCached(cacheKey, report, 600);
    return report;
  }
}

export const anomalyEngine = new AnomalyDetectionEngine();
