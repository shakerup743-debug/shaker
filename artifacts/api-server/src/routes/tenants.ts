import { Router } from "express";
import { db, tenantsTable, branchesTable, usersTable, insertTenantSchema, insertBranchSchema } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

/* ── /api/tenants/me — current user's tenant + branches ── */

router.get("/tenants/me", requireTenant, async (req, res) => {
  const tid = req.tenantId!;
  const [tenant] = await req.db!.select().from(tenantsTable).where(eq(tenantsTable.id, tid));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  const branches = await req.db!.select().from(branchesTable).where(eq(branchesTable.tenantId, tid)).orderBy(branchesTable.name);
  res.json({ ...tenant, branches });
});

router.patch("/tenants/me", requireTenant, authorize("owner", "admin"), async (req, res) => {
  const tid = req.tenantId!;
  const [existing] = await req.db!.select().from(tenantsTable).where(eq(tenantsTable.id, tid));
  if (!existing) { res.status(404).json({ error: "Tenant not found" }); return; }

  // Only allow safe fields to be updated
  const { name, nameAr, logo, primaryColor, currency, taxRate, timezone } = req.body as Record<string, string | undefined>;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updateData.name = name;
  if (nameAr !== undefined) updateData.nameAr = nameAr;
  if (logo !== undefined) updateData.logo = logo;
  if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
  if (currency !== undefined) updateData.currency = currency;
  if (taxRate !== undefined) updateData.taxRate = taxRate;
  if (timezone !== undefined) updateData.timezone = timezone;

  const [updated] = await req.db!.update(tenantsTable).set(updateData).where(eq(tenantsTable.id, tid)).returning();
  void logAudit(req, "update", "tenants", tid, { fields: Object.keys(updateData) });
  res.json(updated);
});

router.patch("/tenants/me/settings", requireTenant, authorize("owner", "admin"), async (req, res) => {
  const tid = req.tenantId!;
  const [existing] = await req.db!.select({ settings: tenantsTable.settings }).from(tenantsTable).where(eq(tenantsTable.id, tid));
  if (!existing) { res.status(404).json({ error: "Tenant not found" }); return; }

  const currentSettings = (existing.settings ?? {}) as Record<string, unknown>;
  const patch = req.body as Record<string, unknown>;
  const merged = { ...currentSettings, ...patch };

  const [updated] = await req.db!.update(tenantsTable).set({ settings: merged }).where(eq(tenantsTable.id, tid)).returning({ settings: tenantsTable.settings });
  res.json({ settings: updated.settings });
});

/* ── Tenants CRUD (platform_admin only) ── */
// These routes use the global db pool (no requireTenant) because they operate
// across all tenants. Access is restricted to `platform_admin` — a role that
// is never granted to regular tenant users (owner/admin are tenant-scoped roles).

router.get("/tenants", authorize("platform_admin"), async (req, res) => {
  const tenants = await db.select().from(tenantsTable).orderBy(tenantsTable.createdAt);
  res.json(tenants);
});

router.get("/tenants/:id", authorize("platform_admin"), async (req, res) => {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, Number(req.params.id)));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json(tenant);
});

router.post("/tenants", authorize("platform_admin"), async (req, res) => {
  const parsed = insertTenantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [created] = await db.insert(tenantsTable).values(parsed.data).returning();
  await db.insert(branchesTable).values({ tenantId: created.id, name: "Main Branch", nameAr: "الفرع الرئيسي", isActive: true });
  void logAudit(req, "create", "tenants", created.id, { name: created.name });
  res.status(201).json(created);
});

router.patch("/tenants/:id", authorize("platform_admin"), async (req, res) => {
  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, Number(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Tenant not found" }); return; }
  const [updated] = await db.update(tenantsTable).set({ ...req.body as object, updatedAt: new Date() }).where(eq(tenantsTable.id, Number(req.params.id))).returning();
  void logAudit(req, "update", "tenants", updated.id, { before: existing, after: updated });
  res.json(updated);
});

router.delete("/tenants/:id", authorize("platform_admin"), async (req, res) => {
  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, Number(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Tenant not found" }); return; }
  await db.delete(tenantsTable).where(eq(tenantsTable.id, Number(req.params.id)));
  void logAudit(req, "delete", "tenants", req.params.id as string, { name: existing.name });
  res.status(204).send();
});

/* ── Branches ── */

router.get("/branches", requireTenant, authorize("owner", "admin", "area_manager", "branch_manager"), async (req, res) => {
  const branches = await req.db!.select().from(branchesTable).where(eq(branchesTable.tenantId, req.tenantId!)).orderBy(branchesTable.name);
  res.json(branches);
});

router.get("/branches/:id", requireTenant, authorize("owner", "admin", "area_manager", "branch_manager"), async (req, res) => {
  const [branch] = await req.db!.select().from(branchesTable).where(
    and(eq(branchesTable.id, Number(req.params.id)), eq(branchesTable.tenantId, req.tenantId!))
  );
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

router.post("/branches", requireTenant, authorize("owner", "admin", "area_manager"), async (req, res) => {
  const parsed = insertBranchSchema.safeParse({ ...req.body as object, tenantId: req.tenantId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [created] = await req.db!.insert(branchesTable).values(parsed.data).returning();
  void logAudit(req, "create", "branches", created.id, { name: created.name });
  res.status(201).json(created);
});

router.patch("/branches/:id", requireTenant, authorize("owner", "admin", "area_manager", "branch_manager"), async (req, res) => {
  const tid = req.tenantId!;
  const [existing] = await req.db!.select().from(branchesTable).where(
    and(eq(branchesTable.id, Number(req.params.id)), eq(branchesTable.tenantId, tid))
  );
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const [updated] = await req.db!.update(branchesTable).set({ ...req.body as object, updatedAt: new Date() })
    .where(and(eq(branchesTable.id, Number(req.params.id)), eq(branchesTable.tenantId, tid)))
    .returning();
  void logAudit(req, "update", "branches", updated.id);
  res.json(updated);
});

router.delete("/branches/:id", requireTenant, authorize("owner", "admin"), async (req, res) => {
  const tid = req.tenantId!;
  const [existing] = await req.db!.select().from(branchesTable).where(
    and(eq(branchesTable.id, Number(req.params.id)), eq(branchesTable.tenantId, tid))
  );
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  await req.db!.delete(branchesTable).where(
    and(eq(branchesTable.id, Number(req.params.id)), eq(branchesTable.tenantId, tid))
  );
  void logAudit(req, "delete", "branches", req.params.id as string, { name: existing.name });
  res.status(204).send();
});

export default router;
