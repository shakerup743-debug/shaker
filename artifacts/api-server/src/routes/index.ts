import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import signupRouter from "./signup.js";
import leadsRouter from "./leads.js";
import googleAuthRouter from "./google-auth.js";
import sseRouter from "./sse.js";
import publicRouter from "./public.js";
import qrRouter from "./qr.js";
import categoriesRouter from "./categories.js";
import productsRouter from "./products.js";
import ordersRouter from "./orders.js";
import kitchenRouter from "./kitchen.js";
import inventoryRouter from "./inventory.js";
import wasteRouter from "./waste.js";
import reportsRouter from "./reports.js";
import usersRouter from "./users.js";
import adminRouter from "./admin.js";
import customersRouter from "./customers.js";
import suppliersRouter from "./suppliers.js";
import couponsRouter from "./coupons.js";
import tablesRouter from "./tables.js";
import tenantsRouter from "./tenants.js";
import aiRouter from "./ai.js";
import webhooksRouter from "./webhooks.js";
import apiKeysRouter from "./api-keys.js";
import loyaltyRouter from "./loyalty.js";
import auditRouter from "./audit.js";
import securityRouter from "./security.js";
import billingRouter from "./billing.js";
import subscriptionRouter from "./subscription.js";
import cashierRouter from "./cashier.js";
import pinRouter from "./pin.js";
import masterPasswordRouter from "./master-password.js";
import amendmentsRouter from "./amendments.js";
import aiChatRouter from "./ai-chat.js";
import openapiRouter from "./openapi.js";
import uploadsRouter from "./uploads.js";
import qrOrdersRouter from "./qr-orders.js";
import discountsRouter from "./discounts.js";
import invoiceSettingsRouter from "./invoice-settings.js";
import { PLANS, TRIAL_DAYS, isUnlimited } from "@workspace/db";
import { authenticate } from "../middleware/authenticate.js";
import { auditMiddleware } from "../middleware/audit-auto.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { readOnlyGuard } from "../middleware/check-feature.js";

const router: IRouter = Router();

// ── Public (no auth required) ────────────────────────────────
router.use(healthRouter);
router.use(authRouter);
router.use(signupRouter);
router.use(leadsRouter);
router.use(googleAuthRouter);
router.use(sseRouter);
router.use(publicRouter);
router.use(openapiRouter);

// Paddle webhook is mounted at app.ts level (needs raw body)

// Public plans catalog (no auth required)
router.get("/subscription/plans", (_req, res) => {
  res.json({
    trialDays: TRIAL_DAYS,
    paddleConfigured: Boolean(process.env.PADDLE_API_KEY),
    plans: Object.values(PLANS).map((p) => ({
      id: p.id, name: p.name, nameAr: p.nameAr,
      yearlyPriceUsd: p.yearlyPriceUsd,
      limits: {
        maxBranches: isUnlimited(p.limits.maxBranches) ? null : p.limits.maxBranches,
        maxUsers:    isUnlimited(p.limits.maxUsers)    ? null : p.limits.maxUsers,
      },
      features: p.features,
      highlighted: p.highlighted ?? false,
    })),
  });
});

// ── Authenticated (no tenant context required) ────────────────
router.use(authenticate);
router.use(auditMiddleware);

// tenantsRouter: super-admin CRUD on the tenants table — intentionally exempt
// from requireTenant because it must operate across all tenants with global db.
router.use(tenantsRouter);

// ── Authenticated + tenant-scoped ────────────────────────────
// requireTenant is idempotent: per-router requireTenant calls in individual
// files are safe no-ops once this global middleware has already run.
router.use(requireTenant);

// Global revenue protection: block ALL writes from expired/canceled tenants.
// Subscription / billing routes bypass this internally so users can still renew.
router.use(readOnlyGuard);

router.use(qrRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(kitchenRouter);
router.use(inventoryRouter);
router.use(wasteRouter);
router.use(reportsRouter);
router.use(usersRouter);
router.use(adminRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(couponsRouter);
router.use(tablesRouter);
router.use(aiRouter);
router.use(webhooksRouter);
router.use(apiKeysRouter);
router.use(loyaltyRouter);
router.use(auditRouter);
router.use(securityRouter);
router.use(billingRouter);
router.use(subscriptionRouter);
router.use(cashierRouter);
router.use(pinRouter);
router.use(masterPasswordRouter);
router.use(amendmentsRouter);
router.use(aiChatRouter);
router.use(uploadsRouter);
router.use(qrOrdersRouter);
router.use(discountsRouter);
router.use(invoiceSettingsRouter);

export default router;
