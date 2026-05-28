// Recommendation Engine — what should we offer this customer next?
//
// Three-tier blend:
//   1. Personalised (Collaborative Filtering) — customers similar to this one
//      bought these products; recommend ones the target hasn't tried.
//   2. Basket completion (Association mining) — items frequently bought
//      together with what's currently in cart.
//   3. Context fallback — when no signal exists, fall back to global top
//      sellers for the current hour and day-of-week.
//
// All three are simple, deterministic, and run on Drizzle (RLS-safe).

import { and, eq, inArray, sql, gte, ne } from "drizzle-orm";
import { ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import type { createTenantDb } from "@workspace/db";
import { getCached, setCached } from "./llm-client.js";

type Db = ReturnType<typeof createTenantDb>;

export interface ProductRecommendation {
  productId: number;
  productName: string;
  price: number;
  score: number;
  reason: string;
  /** Tag for the UI to colour-code: personal / pairing / trending */
  source: "personal" | "pairing" | "trending";
}

interface CustomerProductRow {
  customerId: number | null;
  productId: number;
  productName: string;
  quantity: number;
  price: number;
}

export class RecommendationEngine {
  /**
   * Personalised recommendations for a known customer (collaborative filtering).
   *
   * 1. Find the customer's top products (their "taste").
   * 2. Find other customers that share at least 1 of those tastes.
   * 3. From those neighbours, find products they bought that our customer hasn't.
   * 4. Score by frequency among neighbours.
   */
  async forCustomer(
    db: Db,
    tenantId: number,
    customerId: number,
    limit = 6,
  ): Promise<ProductRecommendation[]> {
    const cacheKey = `reco:cust:${tenantId}:${customerId}:${limit}`;
    const cached = getCached<ProductRecommendation[]>(cacheKey);
    if (cached) return cached;

    // 1) Customer's own product history
    const mine = await db
      .select({
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.customerId, customerId),
        eq(ordersTable.status, "completed"),
      ));

    if (mine.length === 0) {
      // New customer → fall back to trending
      return this.trending(db, tenantId, limit);
    }

    const ownedFrequency = new Map<number, number>();
    for (const m of mine) {
      ownedFrequency.set(m.productId, (ownedFrequency.get(m.productId) ?? 0) + m.quantity);
    }
    const ownedProductIds = [...ownedFrequency.keys()];
    const ownedSet = new Set(ownedProductIds);

    // 2) Other customers who bought at least one of these products
    const neighbours = await db
      .select({
        customerId: ordersTable.customerId,
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        ne(ordersTable.customerId, customerId),
      ));

    // First, who are the neighbours? (customers with overlap)
    const neighbourOverlap = new Map<number, number>();
    for (const n of neighbours) {
      if (n.customerId == null) continue;
      if (ownedSet.has(n.productId)) {
        neighbourOverlap.set(n.customerId, (neighbourOverlap.get(n.customerId) ?? 0) + 1);
      }
    }

    // Keep only top-100 neighbours (most similar)
    const topNeighbourIds = new Set(
      [...neighbourOverlap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([id]) => id),
    );

    // 3) Aggregate what those neighbours bought that we haven't
    const scoreByProduct = new Map<number, { name: string; price: number; score: number }>();
    for (const n of neighbours) {
      if (n.customerId == null || !topNeighbourIds.has(n.customerId)) continue;
      if (ownedSet.has(n.productId)) continue;
      const cur = scoreByProduct.get(n.productId)
        ?? { name: n.productName, price: Number(n.unitPrice), score: 0 };
      cur.score += n.quantity;
      scoreByProduct.set(n.productId, cur);
    }

    const recommendations: ProductRecommendation[] = [...scoreByProduct.entries()]
      .map(([productId, v]) => ({
        productId,
        productName: v.name,
        price: v.price,
        score: v.score,
        source: "personal" as const,
        reason: `عملاء بنفس ذوقك طلبوه ${v.score} مرة`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Fill any gap with trending
    if (recommendations.length < limit) {
      const trending = await this.trending(db, tenantId, limit - recommendations.length);
      const have = new Set(recommendations.map(r => r.productId));
      for (const t of trending) {
        if (!have.has(t.productId)) recommendations.push(t);
        if (recommendations.length >= limit) break;
      }
    }

    setCached(cacheKey, recommendations, 600);
    return recommendations;
  }

  /**
   * Basket-pairing recommendations: given products currently in cart, what
   * is most often bought together? Pure association mining (no LLM).
   *
   * Returns ranked products NOT in the cart.
   */
  async forBasket(
    db: Db,
    tenantId: number,
    cartProductIds: number[],
    limit = 5,
  ): Promise<ProductRecommendation[]> {
    if (cartProductIds.length === 0) return this.trending(db, tenantId, limit);
    const cacheKey = `reco:basket:${tenantId}:${[...cartProductIds].sort().join(",")}:${limit}`;
    const cached = getCached<ProductRecommendation[]>(cacheKey);
    if (cached) return cached;

    // Find orders that contain ANY of these products
    const containing = await db
      .select({ orderId: orderItemsTable.orderId })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        inArray(orderItemsTable.productId, cartProductIds),
      ));

    const orderIds = [...new Set(containing.map(c => c.orderId))];
    if (orderIds.length === 0) return this.trending(db, tenantId, limit);

    // Get all items inside those orders, skip the cart's own products
    const cartSet = new Set(cartProductIds);
    const companions = await db
      .select({
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
      })
      .from(orderItemsTable)
      .where(inArray(orderItemsTable.orderId, orderIds));

    const score = new Map<number, { name: string; price: number; count: number }>();
    for (const c of companions) {
      if (cartSet.has(c.productId)) continue;
      const cur = score.get(c.productId)
        ?? { name: c.productName, price: Number(c.unitPrice), count: 0 };
      cur.count += c.quantity;
      score.set(c.productId, cur);
    }

    const recs: ProductRecommendation[] = [...score.entries()]
      .map(([productId, v]) => ({
        productId,
        productName: v.name,
        price: v.price,
        score: v.count,
        source: "pairing" as const,
        reason: `يطلب مع منتجاتك ${v.count} مرة`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    setCached(cacheKey, recs, 600);
    return recs;
  }

  /**
   * Trending products for the current hour and day-of-week.
   * Used as fallback for new customers / empty baskets.
   */
  async trending(
    db: Db,
    tenantId: number,
    limit = 6,
  ): Promise<ProductRecommendation[]> {
    const cacheKey = `reco:trending:${tenantId}:${limit}`;
    const cached = getCached<ProductRecommendation[]>(cacheKey);
    if (cached) return cached;

    const since = new Date(Date.now() - 30 * 86400_000);
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDow = now.getUTCDay();

    const rows = await db
      .select({
        productId: orderItemsTable.productId,
        productName: orderItemsTable.productName,
        quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice,
        createdAt: ordersTable.createdAt,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        gte(ordersTable.createdAt, since),
      ));

    const score = new Map<number, { name: string; price: number; score: number }>();
    for (const r of rows) {
      const h = new Date(r.createdAt).getUTCHours();
      const d = new Date(r.createdAt).getUTCDay();
      // weight: same hour ±1 → 3, same dow → 2, any → 1
      let w = 1;
      if (Math.abs(h - currentHour) <= 1) w += 2;
      if (d === currentDow) w += 1;
      const cur = score.get(r.productId)
        ?? { name: r.productName, price: Number(r.unitPrice), score: 0 };
      cur.score += r.quantity * w;
      score.set(r.productId, cur);
    }

    const recs: ProductRecommendation[] = [...score.entries()]
      .map(([productId, v]) => ({
        productId,
        productName: v.name,
        price: v.price,
        score: v.score,
        source: "trending" as const,
        reason: `الأكثر طلباً في هذا الوقت`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    setCached(cacheKey, recs, 900);
    return recs;
  }

  /**
   * Hybrid: if customerId provided → personal; if cart provided → pairing; else → trending.
   */
  async hybrid(
    db: Db,
    tenantId: number,
    opts: { customerId?: number; cartProductIds?: number[]; limit?: number },
  ): Promise<ProductRecommendation[]> {
    const limit = opts.limit ?? 6;
    if (opts.customerId) return this.forCustomer(db, tenantId, opts.customerId, limit);
    if (opts.cartProductIds && opts.cartProductIds.length > 0) {
      return this.forBasket(db, tenantId, opts.cartProductIds, limit);
    }
    return this.trending(db, tenantId, limit);
  }
}

export const recommendationEngine = new RecommendationEngine();
