import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { productsTable, categoriesTable, productIngredientsTable, inventoryTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  UpdateProductParams,
  DeleteProductParams,
  GetProductParams,
  ToggleProductParams,
  ListProductsQueryParams,
  GetProductIngredientsParams,
  SetProductIngredientsParams,
  SetProductIngredientsBody,
} from "@workspace/api-zod";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

router.use(requireTenant);

type TenantDb = NonNullable<Express.Request["db"]>;

async function getProductsWithCategory(dbx: TenantDb, tenantId: number, categoryId?: number, active?: boolean) {
  const allProducts = await dbx
    .select()
    .from(productsTable)
    .where(eq(productsTable.tenantId, tenantId));
  const allCategories = await dbx
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.tenantId, tenantId));
  const catMap = new Map(allCategories.map((c) => [c.id, c.name]));

  return allProducts
    .filter((p) => (categoryId != null ? p.categoryId === categoryId : true))
    .filter((p) => (active != null ? p.isActive === active : true))
    .map((p) => ({
      ...p,
      price: parseFloat(p.price),
      categoryName: catMap.get(p.categoryId) ?? null,
    }));
}

async function getIngredientsForProduct(dbx: TenantDb, productId: number, tenantId: number) {
  const rows = await dbx
    .select({
      id: productIngredientsTable.id,
      productId: productIngredientsTable.productId,
      inventoryId: productIngredientsTable.inventoryId,
      quantityPerUnit: productIngredientsTable.quantityPerUnit,
      inventoryName: inventoryTable.name,
      unit: inventoryTable.unit,
    })
    .from(productIngredientsTable)
    .innerJoin(inventoryTable, and(
      eq(productIngredientsTable.inventoryId, inventoryTable.id),
      eq(inventoryTable.tenantId, tenantId),
    ))
    .where(eq(productIngredientsTable.productId, productId));
  return rows.map((r) => ({ ...r, quantityPerUnit: parseFloat(r.quantityPerUnit) }));
}

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const products = await getProductsWithCategory(req.db!, req.tenantId!, parsed.data.categoryId, parsed.data.active);
  res.json(products);
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [product] = await req.db!
    .insert(productsTable)
    .values({ ...parsed.data, price: String(parsed.data.price), tenantId: req.tenantId! })
    .returning();
  const categories = await req.db!
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.id, product.categoryId), eq(categoriesTable.tenantId, req.tenantId!)));
  res.status(201).json({ ...product, price: parseFloat(product.price), categoryName: categories[0]?.name ?? null });
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await req.db!
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, req.tenantId!)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const categories = await req.db!.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId));
  res.json({ ...product, price: parseFloat(product.price), categoryName: categories[0]?.name ?? null });
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) updateData.price = String(parsed.data.price);
  const [product] = await req.db!
    .update(productsTable)
    .set(updateData)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, req.tenantId!)))
    .returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const categories = await req.db!.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId));
  res.json({ ...product, price: parseFloat(product.price), categoryName: categories[0]?.name ?? null });
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [product] = await req.db!
    .delete(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, req.tenantId!)))
    .returning();
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.sendStatus(204);
});

router.patch("/products/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleProductParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [current] = await req.db!
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, req.tenantId!)));
  if (!current) { res.status(404).json({ error: "Product not found" }); return; }
  const [product] = await req.db!
    .update(productsTable)
    .set({ isActive: !current.isActive })
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, req.tenantId!)))
    .returning();
  const categories = await req.db!.select().from(categoriesTable).where(eq(categoriesTable.id, product.categoryId));
  res.json({ ...product, price: parseFloat(product.price), categoryName: categories[0]?.name ?? null });
});

router.get("/products/:id/ingredients", async (req, res): Promise<void> => {
  const params = GetProductIngredientsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const tid = req.tenantId!;
  const [product] = await req.db!
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tid)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(await getIngredientsForProduct(req.db!, params.data.id, tid));
});

router.put("/products/:id/ingredients", async (req, res): Promise<void> => {
  const params = SetProductIngredientsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SetProductIngredientsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const tid = req.tenantId!;
  const [product] = await req.db!
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, params.data.id), eq(productsTable.tenantId, tid)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  if (parsed.data.ingredients.length > 0) {
    const requestedIds = parsed.data.ingredients.map((i) => i.inventoryId);
    // Verify all requested inventory IDs belong to this tenant
    const found = await req.db!.select({ id: inventoryTable.id }).from(inventoryTable)
      .where(and(inArray(inventoryTable.id, requestedIds), eq(inventoryTable.tenantId, tid)));
    const foundIds = new Set(found.map((r) => r.id));
    const missing = requestedIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      res.status(422).json({ error: `Inventory item(s) not found: ${missing.join(", ")}` });
      return;
    }
  }

  await req.db!.transaction(async (tx) => {
    await tx.delete(productIngredientsTable).where(eq(productIngredientsTable.productId, params.data.id));
    if (parsed.data.ingredients.length > 0) {
      await tx.insert(productIngredientsTable).values(
        parsed.data.ingredients.map((ing) => ({
          productId: params.data.id,
          inventoryId: ing.inventoryId,
          quantityPerUnit: String(ing.quantityPerUnit),
        }))
      );
    }
  });
  res.json(await getIngredientsForProduct(req.db!, params.data.id, tid));
});

export default router;
