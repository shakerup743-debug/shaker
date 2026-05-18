/**
 * Multi-Tenant Isolation Tests
 *
 * Verifies that RLS and application-layer tenant filters
 * prevent data leakage between tenants at the database level.
 *
 * Strategy: spin up two isolated pg clients, set different
 * app.current_tenant_id session variables, and assert each
 * client can only see its own rows.
 *
 * Run: pnpm --filter @workspace/api-server run test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mirrors requireTenant middleware exactly:
 *  1. SET app.current_tenant_id  (RLS policy reads this)
 *  2. SET ROLE foodoro_app        (limited role — not superuser → RLS applies)
 */
async function withTenant<T>(
  tenantId: number,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [
      String(tenantId),
    ]);
    await client.query(`SET ROLE foodoro_app`);
    const result = await fn(client);
    await client.query(`RESET ROLE`);
    await client.query(`RESET app.current_tenant_id`);
    return result;
  } catch (err) {
    // Always reset role/context before re-throwing
    try { await client.query(`RESET ROLE`); } catch (_) { /* ignore */ }
    try { await client.query(`RESET app.current_tenant_id`); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Connects as postgres superuser (bypasses RLS) — used for test setup/teardown
 * and for verifying that rows weren't modified.
 */
async function withoutTenant<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Simulates a connection with NO tenant context but under the limited role —
 * verifies that FORCE RLS blocks all rows when tenant_id is not set.
 */
async function withAppRoleNoContext<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`RESET app.current_tenant_id`);
    await client.query(`SET ROLE foodoro_app`);
    const result = await fn(client);
    await client.query(`RESET ROLE`);
    return result;
  } catch (err) {
    try { await client.query(`RESET ROLE`); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ── Test setup ───────────────────────────────────────────────────────────────

let tenantAId: number;
let tenantBId: number;
let categoryAId: number;
let categoryBId: number;
let productAId: number;
let productBId: number;
let orderAId: number;
let orderBId: number;

beforeAll(async () => {
  // Create two isolated test tenants
  const { rows: [tenantA] } = await withoutTenant((c) =>
    c.query(
      `INSERT INTO tenants (slug, name, name_ar)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ["test-tenant-alpha-rls", "Test Tenant Alpha", "مستأجر ألفا"]
    )
  );
  tenantAId = tenantA.id;

  const { rows: [tenantB] } = await withoutTenant((c) =>
    c.query(
      `INSERT INTO tenants (slug, name, name_ar)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ["test-tenant-beta-rls", "Test Tenant Beta", "مستأجر بيتا"]
    )
  );
  tenantBId = tenantB.id;

  // Create a category in each tenant
  const { rows: [catA] } = await withTenant(tenantAId, (c) =>
    c.query(
      `INSERT INTO categories (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [tenantAId, "Alpha Category"]
    )
  );
  categoryAId = catA.id;

  const { rows: [catB] } = await withTenant(tenantBId, (c) =>
    c.query(
      `INSERT INTO categories (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [tenantBId, "Beta Category"]
    )
  );
  categoryBId = catB.id;

  // Create a product in each tenant
  const { rows: [prodA] } = await withTenant(tenantAId, (c) =>
    c.query(
      `INSERT INTO products (tenant_id, name, price, category_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantAId, "Alpha Burger", 49.99, categoryAId]
    )
  );
  productAId = prodA.id;

  const { rows: [prodB] } = await withTenant(tenantBId, (c) =>
    c.query(
      `INSERT INTO products (tenant_id, name, price, category_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantBId, "Beta Pizza", 59.99, categoryBId]
    )
  );
  productBId = prodB.id;

  // Create an order in each tenant
  const { rows: [ordA] } = await withTenant(tenantAId, (c) =>
    c.query(
      `INSERT INTO orders (tenant_id, total, status, order_number)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantAId, 49.99, "pending", "ORD-TEST-A001"]
    )
  );
  orderAId = ordA.id;

  const { rows: [ordB] } = await withTenant(tenantBId, (c) =>
    c.query(
      `INSERT INTO orders (tenant_id, total, status, order_number)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantBId, 59.99, "pending", "ORD-TEST-B001"]
    )
  );
  orderBId = ordB.id;
});

afterAll(async () => {
  // Clean up test data — delete tenants cascade-removes everything
  await withoutTenant((c) =>
    c.query(`DELETE FROM tenants WHERE slug IN ($1, $2)`, [
      "test-tenant-alpha-rls",
      "test-tenant-beta-rls",
    ])
  );
  await pool.end();
});

// ── Category isolation ────────────────────────────────────────────────────────

describe("Category isolation", () => {
  it("Tenant A sees only its own categories", async () => {
    const { rows } = await withTenant(tenantAId, (c) =>
      c.query(`SELECT id FROM categories`)
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(categoryAId);
    expect(ids).not.toContain(categoryBId);
  });

  it("Tenant B sees only its own categories", async () => {
    const { rows } = await withTenant(tenantBId, (c) =>
      c.query(`SELECT id FROM categories`)
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(categoryBId);
    expect(ids).not.toContain(categoryAId);
  });

  it("Tenant A cannot update Tenant B's category", async () => {
    // RLS FORCE means UPDATE is filtered → 0 rows affected, not an error
    const { rowCount } = await withTenant(tenantAId, (c) =>
      c.query(`UPDATE categories SET name = 'Hijacked' WHERE id = $1`, [
        categoryBId,
      ])
    );
    expect(rowCount).toBe(0);

    // Verify original name is intact
    const { rows } = await withoutTenant((c) =>
      c.query(`SELECT name FROM categories WHERE id = $1`, [categoryBId])
    );
    expect(rows[0].name).toBe("Beta Category");
  });

  it("Tenant A cannot delete Tenant B's category", async () => {
    const { rowCount } = await withTenant(tenantAId, (c) =>
      c.query(`DELETE FROM categories WHERE id = $1`, [categoryBId])
    );
    expect(rowCount).toBe(0);

    // Verify it still exists
    const { rows } = await withoutTenant((c) =>
      c.query(`SELECT id FROM categories WHERE id = $1`, [categoryBId])
    );
    expect(rows).toHaveLength(1);
  });
});

// ── Product isolation ─────────────────────────────────────────────────────────

describe("Product isolation", () => {
  it("Tenant A sees only its own products", async () => {
    const { rows } = await withTenant(tenantAId, (c) =>
      c.query(`SELECT id FROM products`)
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(productAId);
    expect(ids).not.toContain(productBId);
  });

  it("Tenant B sees only its own products", async () => {
    const { rows } = await withTenant(tenantBId, (c) =>
      c.query(`SELECT id FROM products`)
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(productBId);
    expect(ids).not.toContain(productAId);
  });

  it("Tenant A cannot read Tenant B's product by ID", async () => {
    const { rows } = await withTenant(tenantAId, (c) =>
      c.query(`SELECT id FROM products WHERE id = $1`, [productBId])
    );
    expect(rows).toHaveLength(0);
  });

  it("Tenant A cannot change Tenant B's product price", async () => {
    const { rowCount } = await withTenant(tenantAId, (c) =>
      c.query(`UPDATE products SET price = 1 WHERE id = $1`, [productBId])
    );
    expect(rowCount).toBe(0);

    const { rows } = await withoutTenant((c) =>
      c.query(`SELECT price FROM products WHERE id = $1`, [productBId])
    );
    expect(Number(rows[0].price)).toBe(59.99);
  });
});

// ── Order isolation ───────────────────────────────────────────────────────────

describe("Order isolation", () => {
  it("Tenant A sees only its own orders", async () => {
    const { rows } = await withTenant(tenantAId, (c) =>
      c.query(`SELECT id FROM orders`)
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(orderAId);
    expect(ids).not.toContain(orderBId);
  });

  it("Tenant B sees only its own orders", async () => {
    const { rows } = await withTenant(tenantBId, (c) =>
      c.query(`SELECT id FROM orders`)
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(orderBId);
    expect(ids).not.toContain(orderAId);
  });

  it("Tenant A cannot complete Tenant B's order", async () => {
    const { rowCount } = await withTenant(tenantAId, (c) =>
      c.query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [
        orderBId,
      ])
    );
    expect(rowCount).toBe(0);

    const { rows } = await withoutTenant((c) =>
      c.query(`SELECT status FROM orders WHERE id = $1`, [orderBId])
    );
    expect(rows[0].status).toBe("pending");
  });
});

// ── No-context isolation ─────────────────────────────────────────────────────

describe("No tenant context = empty results (foodoro_app role, no tenant set)", () => {
  it("categories table returns 0 rows when no tenant context is set (FORCE RLS)", async () => {
    const { rows } = await withAppRoleNoContext((c) =>
      c.query(`SELECT id FROM categories`)
    );
    expect(rows).toHaveLength(0);
  });

  it("products table returns 0 rows when no tenant context is set", async () => {
    const { rows } = await withAppRoleNoContext((c) =>
      c.query(`SELECT id FROM products`)
    );
    expect(rows).toHaveLength(0);
  });

  it("orders table returns 0 rows when no tenant context is set", async () => {
    const { rows } = await withAppRoleNoContext((c) =>
      c.query(`SELECT id FROM orders`)
    );
    expect(rows).toHaveLength(0);
  });
});

// ── Cross-tenant INSERT blocked ───────────────────────────────────────────────

describe("Cross-tenant INSERT blocked", () => {
  it("Cannot INSERT a category with another tenant's ID under tenant A context", async () => {
    await expect(
      withTenant(tenantAId, (c) =>
        c.query(
          `INSERT INTO categories (tenant_id, name) VALUES ($1, $2)`,
          [tenantBId, "Injected into B"]
        )
      )
    ).rejects.toThrow();
  });
});
