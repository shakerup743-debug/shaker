// AI engines routes: /api/ai/predictions/*, /api/ai/recommendations/*, /api/ai/anomalies/*
//
// All three engines are tenant-scoped (RLS-safe via req.db).
// Heavy reads are cached in-process for 10-30 minutes via llm-client.ts cache.

import { Router } from "express";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { predictiveEngine } from "../lib/ai/predictive-engine.js";
import { recommendationEngine } from "../lib/ai/recommendation-engine.js";
import { anomalyEngine } from "../lib/ai/anomaly-detection.js";
import { logger } from "../lib/logger.js";

const router = Router();
router.use(requireTenant);

function tomorrowIso(): string {
  return new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
}

// ─── Predictive ────────────────────────────────────────────────────────────

/**
 * GET /api/ai/predictions/daily?date=YYYY-MM-DD
 * Returns the full daily forecast (orders, revenue, peak hour, top products, staffing).
 */
router.get(
  "/ai/predictions/daily",
  authorize("owner", "admin", "area_manager", "branch_manager", "accountant"),
  async (req, res) => {
    try {
      const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date : tomorrowIso();
      const prediction = await predictiveEngine.predictDaily(req.db!, req.tenantId!, date);
      res.json({ success: true, data: prediction });
    } catch (err) {
      logger.error({ err }, "predictive.daily failed");
      res.status(500).json({ success: false, error: "PREDICTION_FAILED" });
    }
  },
);

/**
 * GET /api/ai/predictions/products?date=YYYY-MM-DD
 * Per-product demand forecast.
 */
router.get(
  "/ai/predictions/products",
  authorize("owner", "admin", "area_manager", "branch_manager", "inventory_manager", "accountant"),
  async (req, res) => {
    try {
      const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date : tomorrowIso();
      const data = await predictiveEngine.predictProductDemand(req.db!, req.tenantId!, date);
      res.json({ success: true, data, meta: { date, count: data.length } });
    } catch (err) {
      logger.error({ err }, "predictive.products failed");
      res.status(500).json({ success: false, error: "PREDICTION_FAILED" });
    }
  },
);

/**
 * GET /api/ai/predictions/inventory-plan?days=7
 * Aggregated inventory needs for the next N days.
 */
router.get(
  "/ai/predictions/inventory-plan",
  authorize("owner", "admin", "area_manager", "branch_manager", "inventory_manager"),
  async (req, res) => {
    try {
      const days = Math.max(1, Math.min(30, parseInt(String(req.query.days ?? "7"), 10) || 7));
      const data = await predictiveEngine.inventoryPlan(req.db!, req.tenantId!, days);
      res.json({ success: true, data, meta: { days, count: data.length } });
    } catch (err) {
      logger.error({ err }, "predictive.inventory failed");
      res.status(500).json({ success: false, error: "PREDICTION_FAILED" });
    }
  },
);

/**
 * GET /api/ai/predictions/narrative?date=YYYY-MM-DD
 * LLM-written 4-bullet contextual narrative for the day's forecast.
 */
router.get(
  "/ai/predictions/narrative",
  authorize("owner", "admin", "area_manager"),
  async (req, res) => {
    try {
      const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date : tomorrowIso();
      const narrative = await predictiveEngine.contextualNarrative(req.db!, req.tenantId!, date);
      res.json({ success: true, data: { date, narrative } });
    } catch (err) {
      logger.error({ err }, "predictive.narrative failed");
      res.status(500).json({ success: false, error: "PREDICTION_FAILED" });
    }
  },
);

// ─── Recommendations ───────────────────────────────────────────────────────

/**
 * GET /api/ai/recommendations/trending?limit=6
 */
router.get(
  "/ai/recommendations/trending",
  async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(20, parseInt(String(req.query.limit ?? "6"), 10) || 6));
      const data = await recommendationEngine.trending(req.db!, req.tenantId!, limit);
      res.json({ success: true, data });
    } catch (err) {
      logger.error({ err }, "reco.trending failed");
      res.status(500).json({ success: false, error: "RECO_FAILED" });
    }
  },
);

/**
 * GET /api/ai/recommendations/customer/:customerId?limit=6
 */
router.get(
  "/ai/recommendations/customer/:customerId",
  async (req, res) => {
    try {
      const customerId = parseInt(req.params.customerId!, 10);
      if (!Number.isInteger(customerId) || customerId <= 0) {
        res.status(400).json({ success: false, error: "INVALID_CUSTOMER_ID" });
        return;
      }
      const limit = Math.max(1, Math.min(20, parseInt(String(req.query.limit ?? "6"), 10) || 6));
      const data = await recommendationEngine.forCustomer(req.db!, req.tenantId!, customerId, limit);
      res.json({ success: true, data });
    } catch (err) {
      logger.error({ err }, "reco.customer failed");
      res.status(500).json({ success: false, error: "RECO_FAILED" });
    }
  },
);

/**
 * POST /api/ai/recommendations/basket   body: { cartProductIds: number[], limit?: number, customerId?: number }
 * Hybrid: customer-aware if customerId given; else basket pairing; else trending.
 */
router.post(
  "/ai/recommendations/basket",
  async (req, res) => {
    try {
      const body = (req.body ?? {}) as { cartProductIds?: unknown; customerId?: unknown; limit?: unknown };
      const cart = Array.isArray(body.cartProductIds)
        ? body.cartProductIds.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0)
        : [];
      const customerId = typeof body.customerId === "number" && body.customerId > 0 ? body.customerId : undefined;
      const limit = typeof body.limit === "number" ? Math.max(1, Math.min(20, body.limit)) : 6;
      const data = await recommendationEngine.hybrid(req.db!, req.tenantId!, {
        customerId, cartProductIds: cart, limit,
      });
      res.json({ success: true, data });
    } catch (err) {
      logger.error({ err }, "reco.basket failed");
      res.status(500).json({ success: false, error: "RECO_FAILED" });
    }
  },
);

// ─── Anomaly Detection ─────────────────────────────────────────────────────

/**
 * GET /api/ai/anomalies
 * Full anomaly report — statistical findings + optional LLM narrative.
 */
router.get(
  "/ai/anomalies",
  authorize("owner", "admin", "area_manager", "branch_manager", "accountant"),
  async (req, res) => {
    try {
      const report = await anomalyEngine.detect(req.db!, req.tenantId!);
      res.json({ success: true, data: report });
    } catch (err) {
      logger.error({ err }, "anomaly.detect failed");
      res.status(500).json({ success: false, error: "ANOMALY_FAILED" });
    }
  },
);

export default router;
