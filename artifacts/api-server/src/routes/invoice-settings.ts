/**
 * Invoice customization — logo, restaurant name, paper size, welcome message,
 * footer text + auto-generated QR code that links to the public digital menu.
 */
import { Router, type Request, type Response } from "express";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(authenticate);

router.get("/invoice-settings", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const r = await db.execute(sql`
    SELECT * FROM invoice_settings
    WHERE tenant_id=${tenantId} AND (branch_id IS NOT DISTINCT FROM ${branchId})
    LIMIT 1
  `);
  res.json({ settings: r.rows[0] ?? null });
});

router.put(
  "/invoice-settings",
  authorize("owner", "admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const {
      branchId = null, logoUrl, restaurantName, paperSize = "80mm",
      invoiceType = "sales", welcomeMessage, showTax = true, showLogo = true, footerText,
    } = req.body as {
      branchId?: number | null; logoUrl?: string | null; restaurantName?: string;
      paperSize?: string; invoiceType?: string; welcomeMessage?: string;
      showTax?: boolean; showLogo?: boolean; footerText?: string;
    };

    await db.execute(sql`
      INSERT INTO invoice_settings
        (tenant_id, branch_id, logo_url, restaurant_name, paper_size, invoice_type,
         welcome_message, show_tax, show_logo, footer_text)
      VALUES
        (${tenantId}, ${branchId}, ${logoUrl ?? null}, ${restaurantName ?? null}, ${paperSize},
         ${invoiceType}, ${welcomeMessage ?? null}, ${showTax}, ${showLogo}, ${footerText ?? null})
      ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
        logo_url        = EXCLUDED.logo_url,
        restaurant_name = EXCLUDED.restaurant_name,
        paper_size      = EXCLUDED.paper_size,
        invoice_type    = EXCLUDED.invoice_type,
        welcome_message = EXCLUDED.welcome_message,
        show_tax        = EXCLUDED.show_tax,
        show_logo       = EXCLUDED.show_logo,
        footer_text     = EXCLUDED.footer_text,
        updated_at      = NOW()
    `);
    await logAudit(req, { entityType: "invoice_settings", entityId: String(tenantId), action: "update" });
    res.json({ ok: true });
  },
);

router.get("/invoice-settings/qr", async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const r = await db.execute(sql`SELECT slug FROM tenants WHERE id=${tenantId}`);
  const slug = (r.rows[0] as { slug?: string } | undefined)?.slug;
  if (!slug) { res.status(404).json({ error: "tenant not found" }); return; }
  const origin = req.headers.origin?.toString()
    ?? `https://${req.headers.host?.toString() ?? "foodpro.local"}`;
  const url = `${origin}/menu/${slug}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#1A2C4E", light: "#FFFFFF" } });
  res.json({ url, dataUrl });
});

export default router;
