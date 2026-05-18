import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, productsTable, productAvailabilityLogTable } from "@workspace/db";
import { sseBroker } from "./sse-broker.js";
import { logger } from "./logger.js";

const INTERVAL_MS = 30_000;

async function reEnableExpiredProducts() {
  const now = new Date();

  const expired = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      tenantId: productsTable.tenantId,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.kitchenAvailable, false),
        isNotNull(productsTable.unavailableUntil),
        lte(productsTable.unavailableUntil, now)
      )
    );

  if (expired.length === 0) return;

  for (const product of expired) {
    await db
      .update(productsTable)
      .set({ kitchenAvailable: true, unavailabilityReason: null, unavailableUntil: null })
      .where(eq(productsTable.id, product.id));

    await db.insert(productAvailabilityLogTable).values({
      tenantId: product.tenantId,
      productId: product.id,
      productName: product.name,
      action: "enabled",
      reason: null,
      reasonNote: "auto-re-enabled by scheduler",
      changedBy: "system",
    });

    sseBroker.emit({
      type: "product:auto_enabled",
      data: {
        productId: product.id,
        productName: product.name,
        tenantId: product.tenantId,
      },
    });

    logger.info({ productId: product.id, productName: product.name }, "Product auto re-enabled by scheduler");
  }
}

export function startAvailabilityScheduler() {
  setInterval(() => {
    reEnableExpiredProducts().catch((err) => {
      logger.error({ err }, "Availability scheduler error");
    });
  }, INTERVAL_MS);

  logger.info("Availability scheduler started (30s interval)");
}
