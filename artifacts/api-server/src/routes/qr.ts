import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { qrTokensTable, restaurantTablesTable } from "@workspace/db";
import { authorize } from "../middleware/authorize.js";

const router: IRouter = Router();

function generateToken(): string {
  const raw = randomBytes(18).toString("base64url");
  return "qr_" + raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22);
}

async function buildQrImage(guestUrl: string): Promise<string> {
  const buf = await QRCode.toBuffer(guestUrl, {
    width: 400,
    margin: 2,
    color: { dark: "#111827", light: "#FFFFFF" },
    errorCorrectionLevel: "H",
  });
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function buildGuestUrl(baseUrl: string | undefined, token: string): string {
  return baseUrl ? `${baseUrl}/order?token=${token}` : `/order?token=${token}`;
}

/* ──────────────────────────────────────────────────────────
   POST /api/qr  — generate a new token for a table
────────────────────────────────────────────────────────── */
router.post("/qr", authorize("admin"), async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const { tableId, baseUrl, expiresAt, notes } = req.body as {
    tableId: number;
    baseUrl?: string;
    expiresAt?: string | null;
    notes?: string | null;
  };

  if (!tableId) { res.status(400).json({ error: "tableId is required" }); return; }

  const [table] = await req.db!
    .select({ id: restaurantTablesTable.id, number: restaurantTablesTable.number, section: restaurantTablesTable.section })
    .from(restaurantTablesTable)
    .where(eq(restaurantTablesTable.id, tableId));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  const token = generateToken();
  const guestUrl = buildGuestUrl(baseUrl, token);
  const qrImage = await buildQrImage(guestUrl);

  const [qrToken] = await req.db!
    .insert(qrTokensTable)
    .values({ token, tenantId, tableId, expiresAt: expiresAt ? new Date(expiresAt) : null, notes: notes ?? null })
    .returning();

  res.status(201).json({ ...qrToken, qrImage, guestUrl, tableNumber: table.number });
});

/* ──────────────────────────────────────────────────────────
   GET /api/qr  — list all tokens for this tenant
────────────────────────────────────────────────────────── */
router.get("/qr", async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;

  const tokens = await req.db!
    .select({
      id: qrTokensTable.id,
      token: qrTokensTable.token,
      tableId: qrTokensTable.tableId,
      tableNumber: restaurantTablesTable.number,
      tableSection: restaurantTablesTable.section,
      tableCapacity: restaurantTablesTable.capacity,
      isActive: qrTokensTable.isActive,
      scansCount: qrTokensTable.scansCount,
      ordersCount: qrTokensTable.ordersCount,
      lastScannedAt: qrTokensTable.lastScannedAt,
      expiresAt: qrTokensTable.expiresAt,
      notes: qrTokensTable.notes,
      createdAt: qrTokensTable.createdAt,
    })
    .from(qrTokensTable)
    .leftJoin(restaurantTablesTable, eq(qrTokensTable.tableId, restaurantTablesTable.id))
    .where(eq(qrTokensTable.tenantId, tenantId))
    .orderBy(desc(qrTokensTable.createdAt));

  res.json(tokens);
});

/* ──────────────────────────────────────────────────────────
   GET /api/qr/:id/image  — get QR image for a token
────────────────────────────────────────────────────────── */
router.get("/qr/:id/image", async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = parseInt(req.params["id"] as string, 10);
  const baseUrl = typeof req.query["baseUrl"] === "string" ? req.query["baseUrl"].trim() : "";

  const [qrToken] = await req.db!
    .select()
    .from(qrTokensTable)
    .where(and(eq(qrTokensTable.id, id), eq(qrTokensTable.tenantId, tenantId)));
  if (!qrToken) { res.status(404).json({ error: "QR token not found" }); return; }

  const guestUrl = buildGuestUrl(baseUrl || undefined, qrToken.token);
  const qrImage = await buildQrImage(guestUrl);

  res.json({ qrImage, guestUrl, token: qrToken.token });
});

/* ──────────────────────────────────────────────────────────
   PATCH /api/qr/:id  — update token (active, expiry, notes)
────────────────────────────────────────────────────────── */
router.patch("/qr/:id", async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = parseInt(req.params["id"] as string, 10);
  const { isActive, expiresAt, notes } = req.body as {
    isActive?: boolean;
    expiresAt?: string | null;
    notes?: string | null;
  };

  const updateData: Record<string, unknown> = {};
  if (isActive !== undefined) updateData["isActive"] = isActive;
  if (expiresAt !== undefined) updateData["expiresAt"] = expiresAt ? new Date(expiresAt) : null;
  if (notes !== undefined) updateData["notes"] = notes;

  const [updated] = await req.db!
    .update(qrTokensTable)
    .set(updateData)
    .where(and(eq(qrTokensTable.id, id), eq(qrTokensTable.tenantId, tenantId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "QR token not found" }); return; }
  res.json(updated);
});

/* ──────────────────────────────────────────────────────────
   DELETE /api/qr/:id  — delete token
────────────────────────────────────────────────────────── */
router.delete("/qr/:id", authorize("admin"), async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const id = parseInt(req.params["id"] as string, 10);

  const [deleted] = await req.db!
    .delete(qrTokensTable)
    .where(and(eq(qrTokensTable.id, id), eq(qrTokensTable.tenantId, tenantId)))
    .returning({ id: qrTokensTable.id });

  if (!deleted) { res.status(404).json({ error: "QR token not found" }); return; }
  res.json({ success: true });
});

/* ──────────────────────────────────────────────────────────
   POST /api/qr/:tableId/regenerate  — deactivate old, create new
────────────────────────────────────────────────────────── */
router.post("/qr/:tableId/regenerate", authorize("admin"), async (req, res): Promise<void> => {
  const tenantId = req.tenantId!;
  const tableId = parseInt(req.params["tableId"] as string, 10);
  const { baseUrl, notes } = req.body as { baseUrl?: string; notes?: string | null };

  const [table] = await req.db!
    .select({ id: restaurantTablesTable.id, number: restaurantTablesTable.number })
    .from(restaurantTablesTable)
    .where(eq(restaurantTablesTable.id, tableId));
  if (!table) { res.status(404).json({ error: "Table not found" }); return; }

  await req.db!
    .update(qrTokensTable)
    .set({ isActive: false })
    .where(and(eq(qrTokensTable.tableId, tableId), eq(qrTokensTable.tenantId, tenantId)));

  const token = generateToken();
  const guestUrl = buildGuestUrl(baseUrl, token);
  const qrImage = await buildQrImage(guestUrl);

  const [qrToken] = await req.db!
    .insert(qrTokensTable)
    .values({ token, tenantId, tableId, notes: notes ?? null })
    .returning();

  res.status(201).json({ ...qrToken, qrImage, guestUrl, tableNumber: table.number });
});

export default router;
