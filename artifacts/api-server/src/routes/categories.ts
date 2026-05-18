import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { categoriesTable } from "@workspace/db";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateCategoryParams,
  DeleteCategoryParams,
} from "@workspace/api-zod";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

router.use(requireTenant);

router.get("/categories", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const categories = await req.db!
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.tenantId, tid))
    .orderBy(categoriesTable.name);
  res.json(categories);
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cat] = await req.db!
    .insert(categoriesTable)
    .values({ ...parsed.data, tenantId: req.tenantId! })
    .returning();
  res.status(201).json(cat);
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cat] = await req.db!
    .update(categoriesTable)
    .set(parsed.data)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.tenantId, req.tenantId!)))
    .returning();
  if (!cat) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(cat);
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [cat] = await req.db!
    .delete(categoriesTable)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.tenantId, req.tenantId!)))
    .returning();
  if (!cat) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
