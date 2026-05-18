/**
 * Offline-first POS hook using IndexedDB.
 * Caches products + categories locally; queues orders when offline.
 */
import { useEffect, useState, useCallback, useRef } from "react";

const DB_NAME = "foodoro-offline";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("pendingOrders")) {
        db.createObjectStore("pendingOrders", { keyPath: "localId", autoIncrement: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, items: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const item of items) s.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbAdd(db: IDBDatabase, store: string, item: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key as IDBValidKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface PendingOrder {
  localId: string;
  payload: unknown;
  createdAt: string;
}

export interface OfflinePosState {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSync: Date | null;
  cacheProducts: (products: unknown[]) => Promise<void>;
  cacheCategories: (categories: unknown[]) => Promise<void>;
  getCachedProducts: <T>() => Promise<T[]>;
  getCachedCategories: <T>() => Promise<T[]>;
  queueOrder: (payload: unknown) => Promise<string>;
  syncPending: (submitFn: (payload: unknown) => Promise<unknown>) => Promise<{ synced: number; failed: number }>;
}

export function useOfflinePos(): OfflinePosState {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    void openDB().then(db => {
      dbRef.current = db;
      void idbGet<PendingOrder>(db, "pendingOrders").then(items => setPendingCount(items.length));
    });

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const cacheProducts = useCallback(async (products: unknown[]) => {
    if (!dbRef.current) return;
    await idbPut(dbRef.current, "products", products);
  }, []);

  const cacheCategories = useCallback(async (categories: unknown[]) => {
    if (!dbRef.current) return;
    await idbPut(dbRef.current, "categories", categories);
  }, []);

  const getCachedProducts = useCallback(<T>(): Promise<T[]> => {
    if (!dbRef.current) return Promise.resolve([]);
    return idbGet<T>(dbRef.current, "products");
  }, []);

  const getCachedCategories = useCallback(<T>(): Promise<T[]> => {
    if (!dbRef.current) return Promise.resolve([]);
    return idbGet<T>(dbRef.current, "categories");
  }, []);

  const queueOrder = useCallback(async (payload: unknown): Promise<string> => {
    if (!dbRef.current) throw new Error("DB not ready");
    const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: PendingOrder = { localId, payload, createdAt: new Date().toISOString() };
    await idbAdd(dbRef.current, "pendingOrders", item);
    setPendingCount(c => c + 1);
    return localId;
  }, []);

  const syncPending = useCallback(async (
    submitFn: (payload: unknown) => Promise<unknown>
  ): Promise<{ synced: number; failed: number }> => {
    if (!dbRef.current) return { synced: 0, failed: 0 };
    setIsSyncing(true);
    const pending = await idbGet<PendingOrder>(dbRef.current, "pendingOrders");
    let synced = 0;
    let failed = 0;

    for (const order of pending) {
      try {
        await submitFn(order.payload);
        await idbDelete(dbRef.current, "pendingOrders", order.localId);
        synced++;
      } catch {
        failed++;
      }
    }

    const remaining = await idbGet<PendingOrder>(dbRef.current, "pendingOrders");
    setPendingCount(remaining.length);
    setLastSync(new Date());
    setIsSyncing(false);
    return { synced, failed };
  }, []);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSync,
    cacheProducts,
    cacheCategories,
    getCachedProducts,
    getCachedCategories,
    queueOrder,
    syncPending,
  };
}
