/**
 * Offline IndexedDB layer (Dexie) — caches product catalogs and queues
 * orders/operations that need to sync to the backend when connectivity
 * returns. UI components query both online and offline state through
 * the same hooks so the cashier never loses a sale.
 */
import Dexie, { type Table } from "dexie";

export interface OfflineProduct {
  id: number;
  name: string;
  price: number;
  categoryId: number;
  categoryName?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  kitchenAvailable?: boolean;
  cachedAt: number;
}

export interface QueuedOperation {
  id?: number;
  type: "order:create" | "order:complete" | "product:update";
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
  syncedAt?: number;
}

export interface CachedResponse {
  key: string;
  data: unknown;
  cachedAt: number;
}

class FoodproOfflineDB extends Dexie {
  products!: Table<OfflineProduct, number>;
  queue!: Table<QueuedOperation, number>;
  cache!: Table<CachedResponse, string>;

  constructor() {
    super("foodpro-offline");
    this.version(1).stores({
      products: "id, categoryId, isActive",
      queue: "++id, type, createdAt, syncedAt",
      cache: "key, cachedAt",
    });
  }
}

export const offlineDB = new FoodproOfflineDB();

/** Save a snapshot of the current product catalog. Call after a successful
 *  GET /api/products so the cashier can keep selling while offline. */
export async function cacheProducts(products: Omit<OfflineProduct, "cachedAt">[]): Promise<void> {
  const now = Date.now();
  await offlineDB.products.clear();
  await offlineDB.products.bulkPut(products.map((p) => ({ ...p, cachedAt: now })));
}

/** Queue an API operation for later replay. */
export async function enqueue(op: Omit<QueuedOperation, "id" | "createdAt" | "attempts">): Promise<number> {
  return offlineDB.queue.add({
    ...op,
    createdAt: Date.now(),
    attempts: 0,
  });
}

const TOKEN_KEY = "foodoro-token";

/** Replay all queued operations. Stops at the first failure to preserve order.
 *  Successful ops are deleted; failed ops bump attempts + lastError. */
export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  const pending = await offlineDB.queue.where("syncedAt").equals(0).or("syncedAt").equals(undefined as unknown as number).sortBy("createdAt");
  // dexie quirk: filter where syncedAt is unset
  const items = pending.length ? pending : await offlineDB.queue.toArray();
  let ok = 0, failed = 0;
  const token = localStorage.getItem(TOKEN_KEY);

  for (const item of items) {
    if (item.syncedAt) continue;
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await offlineDB.queue.update(item.id!, { syncedAt: Date.now() });
      ok += 1;
    } catch (err) {
      await offlineDB.queue.update(item.id!, {
        attempts: (item.attempts ?? 0) + 1,
        lastError: (err as Error).message,
      });
      failed += 1;
      break; // preserve order
    }
  }
  // Tidy: delete fully synced rows
  await offlineDB.queue.where("syncedAt").above(0).delete();
  return { ok, failed };
}

/** Count of unsynced ops for the badge / UI indicator. */
export async function pendingCount(): Promise<number> {
  const rows = await offlineDB.queue.toArray();
  return rows.filter((r) => !r.syncedAt).length;
}
