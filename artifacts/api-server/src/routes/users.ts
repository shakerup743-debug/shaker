import { Router } from "express";
import bcrypt from "bcryptjs";
import { usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.use(requireTenant);

router.get("/users", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const rows = await req.db!
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      mfaEnabled: usersTable.mfaEnabled,
      createdAt: usersTable.createdAt,
      pin: usersTable.pin,
    })
    .from(usersTable)
    .where(eq(usersTable.tenantId, tid));
  // Never expose the PIN hash — only send hasPin boolean
  res.json(rows.map(({ pin, ...u }) => ({ ...u, hasPin: !!pin })));
});

router.post("/users", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const { name, email, password, role, pin } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    pin?: string;
  };

  if (!name || !email || !password || !role) {
    res.status(400).json({ error: "All fields required" });
    return;
  }

  if (pin !== undefined && pin !== "" && !/^\d{4,6}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be 4–6 digits" });
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const pinHashed = pin && pin !== "" ? await bcrypt.hash(pin, 10) : undefined;

  const [user] = await req.db!
    .insert(usersTable)
    .values({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role,
      tenantId: req.tenantId!,
      ...(pinHashed ? { pin: pinHashed } : {}),
    })
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
    });
  void logAudit(req, "user_created", "users", user.id, { name: user.name, email: user.email, role: user.role, hasPin: !!pinHashed });
  res.status(201).json({ ...user, hasPin: !!pinHashed });
});

router.patch("/users/:id", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const tid = req.tenantId!;
  const { name, role, isActive, password, pin } = req.body as {
    name?: string;
    role?: string;
    isActive?: boolean;
    password?: string;
    pin?: string | null;
  };

  if (pin !== undefined && pin !== null && pin !== "" && !/^\d{4,6}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be 4–6 digits" });
    return;
  }

  const update: Partial<typeof usersTable.$inferInsert> = {};
  if (name) update.name = name;
  if (role) update.role = role;
  if (isActive !== undefined) update.isActive = isActive;
  if (password) update.password = await bcrypt.hash(password, 10);
  // pin: "" or undefined = keep existing; pin: null = clear; pin: "1234" = set new
  if (pin === null) update.pin = null;
  else if (pin && pin !== "") update.pin = await bcrypt.hash(pin, 10);
  update.updatedAt = new Date();

  const [user] = await req.db!
    .update(usersTable)
    .set(update)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tid)))
    .returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
    });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  void logAudit(req, "user_updated", "users", user.id, { updatedFields: Object.keys(update) });
  res.json(user);
});

router.delete("/users/:id", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const tid = req.tenantId!;
  const callerId = parseInt(req.user!.sub, 10);

  if (id === callerId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [deleted] = await req.db!
    .delete(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tid)))
    .returning({ id: usersTable.id, name: usersTable.name });

  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  void logAudit(req, "user_deleted", "users", deleted.id, { name: deleted.name });
  res.json({ success: true });
});

export default router;
