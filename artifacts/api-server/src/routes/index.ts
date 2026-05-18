import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
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
import cashierRouter from "./cashier.js";
import pinRouter from "./pin.js";
import masterPasswordRouter from "./master-password.js";
import amendmentsRouter from "./amendments.js";
import openapiRouter from "./openapi.js";
import { authenticate } from "../middleware/authenticate.js";
import { auditMiddleware } from "../middleware/audit-auto.js";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

// ── Public (no auth required) ────────────────────────────────
router.use(healthRouter);
router.use(authRouter);
router.use(sseRouter);
router.use(publicRouter);
router.use(openapiRouter);

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
router.use(cashierRouter);
router.use(pinRouter);
router.use(masterPasswordRouter);
router.use(amendmentsRouter);

export default router;
