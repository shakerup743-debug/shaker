import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./plans";

/**
 * Create a Drizzle instance bound to a specific pool PoolClient.
 * Used by requireTenant middleware to create per-request tenant-scoped
 * DB instances where the session variable app.current_tenant_id is set
 * before any queries run.
 */
export function createTenantDb(client: pg.PoolClient) {
  return drizzle(client, { schema });
}

export * from "./schema";
