/**
 * Apply RLS tenant-isolation policies to all core tables.
 *
 * Run once after the schema has been pushed:
 *   pnpm --filter @workspace/db run apply-rls
 *
 * Idempotent: DROP POLICY IF EXISTS + CREATE POLICY means it is safe to
 * re-run after schema changes.
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = fs.readFileSync(
    path.join(__dirname, "rls-tenant-isolation.sql"),
    "utf8"
  );

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(sql);
    console.log("✅  RLS tenant-isolation policies applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌  Failed to apply RLS policies:", err);
  process.exit(1);
});
