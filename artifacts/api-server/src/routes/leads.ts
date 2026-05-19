import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { logger } from "../lib/logger.js";

const router = Router();

interface LeadBody {
  restaurantName?: string;
  contactName?: string;
  phone?: string;
  branchesCount?: number | string;
  planInterested?: string;
  notes?: string;
  source?: string;
}

/** Strip any non-digit / "+" characters and validate a reasonable length. */
function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (cleaned.length < 7 || cleaned.length > 20) return null;
  return cleaned;
}

/**
 * POST /api/leads — PUBLIC endpoint (no auth) used by the landing page form.
 * Stores a sales lead for the FOODPRO marketing site. Returns generic
 * confirmation so we never leak validation details to bots.
 */
router.post("/leads", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as LeadBody;

  const restaurantName = (body.restaurantName ?? "").trim();
  const contactName    = (body.contactName ?? "").trim();
  const phoneRaw       = (body.phone ?? "").trim();
  const branches = Number(body.branchesCount ?? 1);
  const plan = body.planInterested?.trim() ?? null;
  const notes = body.notes?.trim()?.slice(0, 500) ?? null;
  const source = body.source?.trim()?.slice(0, 60) ?? "landing";

  if (
    restaurantName.length < 2 || restaurantName.length > 120 ||
    contactName.length    < 2 || contactName.length    > 120 ||
    !Number.isFinite(branches) || branches < 1 || branches > 9999
  ) {
    res.status(400).json({ error: "بيانات غير صالحة. تأكد من تعبئة كل الحقول." });
    return;
  }

  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    res.status(400).json({ error: "رقم الجوال غير صالح." });
    return;
  }

  // Simple per-IP throttling: max 5 leads / hour from the same IP
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "").trim();
  const userAgent = (req.headers["user-agent"] ?? "").toString().slice(0, 400);

  try {
    if (ip) {
      const recent = await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM leads
        WHERE ip_address = ${ip} AND created_at > NOW() - INTERVAL '1 hour'
      `);
      const c = Number((recent.rows[0] as { c: number })?.c ?? 0);
      if (c >= 5) {
        res.status(429).json({ error: "محاولات كثيرة. الرجاء المحاولة لاحقاً." });
        return;
      }
    }

    const inserted = await db.execute(sql`
      INSERT INTO leads (
        restaurant_name, contact_name, phone, branches_count,
        plan_interested, source, notes, user_agent, ip_address
      ) VALUES (
        ${restaurantName}, ${contactName}, ${phone}, ${branches},
        ${plan}, ${source}, ${notes}, ${userAgent}, ${ip || null}
      )
      RETURNING id
    `);
    const id = (inserted.rows[0] as { id: number })?.id;

    logger.info({ leadId: id, restaurantName, branches, plan }, "New marketing lead received");

    res.status(201).json({
      ok: true,
      id,
      message: "تم استلام طلبك، سنتواصل معك قريباً.",
    });
  } catch (err) {
    logger.error({ err }, "Failed to insert lead");
    res.status(500).json({ error: "تعذّر استلام طلبك حالياً. الرجاء المحاولة لاحقاً." });
  }
});

/** GET /api/leads — admin/owner only, list recent leads. */
router.get(
  "/leads",
  authenticate,
  authorize("owner", "admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const result = await db.execute(sql`
      SELECT id, restaurant_name, contact_name, phone, branches_count,
             plan_interested, source, status, notes, created_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.json({ leads: result.rows });
  },
);

/** PATCH /api/leads/:id — admin/owner update lead status / notes. */
router.patch(
  "/leads/:id",
  authenticate,
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { status, notes } = req.body as { status?: string; notes?: string };
    await db.execute(sql`
      UPDATE leads
      SET status = COALESCE(${status ?? null}, status),
          notes  = COALESCE(${notes ?? null}, notes),
          updated_at = NOW()
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  },
);

export default router;
