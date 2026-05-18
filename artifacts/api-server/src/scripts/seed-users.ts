import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;

const DEFAULT_USERS = [
  { name: "System Admin", email: "admin@foodoro.com", password: "Admin@1234", role: "admin" },
  { name: "Cashier", email: "cashier@foodoro.com", password: "Cash@1234", role: "cashier" },
  { name: "Kitchen Staff", email: "kitchen@foodoro.com", password: "Kit@1234", role: "kitchen_staff" },
  { name: "Inventory Manager", email: "inventory@foodoro.com", password: "Inv@1234", role: "inventory_manager" },
];

async function seedUsers() {
  console.log("Seeding users...");
  for (const u of DEFAULT_USERS) {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, u.email));
    if (existing) {
      console.log(`  ⏭  ${u.email} already exists`);
      continue;
    }
    const hashed = await bcrypt.hash(u.password, SALT_ROUNDS);
    await db.insert(usersTable).values({ name: u.name, email: u.email, password: hashed, role: u.role });
    console.log(`  ✓  Created ${u.role}: ${u.email}`);
  }
  console.log("Done.");
  process.exit(0);
}

seedUsers().catch((e) => { console.error(e); process.exit(1); });
