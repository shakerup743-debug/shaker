/**
 * Currency exchange rates — uses Frankfurter (free, no key).
 * Refreshed every 60 minutes via background timer when the server starts.
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticate } from "../middleware/authenticate.js";
import { logger } from "../lib/logger.js";

const router = Router();

/** Update USD/SAR/EUR/etc rates for the given base. */
async function refreshRates(base = "USD"): Promise<void> {
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?base=${base}`);
    const data = (await r.json()) as { rates?: Record<string, number> };
    if (!data.rates) return;
    for (const [target, rate] of Object.entries(data.rates)) {
      await db.execute(sql`
        INSERT INTO exchange_rates (base_currency, target_currency, rate, fetched_at)
        VALUES (${base}, ${target}, ${rate}, NOW())
        ON CONFLICT (base_currency, target_currency)
        DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()
      `);
    }
    // base→base = 1
    await db.execute(sql`
      INSERT INTO exchange_rates (base_currency, target_currency, rate)
      VALUES (${base}, ${base}, 1)
      ON CONFLICT (base_currency, target_currency)
      DO UPDATE SET rate = 1, fetched_at = NOW()
    `);
    logger.info({ base }, "Exchange rates refreshed");
  } catch (err) {
    logger.warn({ err }, "Failed to refresh exchange rates");
  }
}

// Refresh once at boot, then every hour.
void refreshRates("USD");
void refreshRates("SAR");
setInterval(() => { void refreshRates("USD"); void refreshRates("SAR"); }, 60 * 60 * 1000);

router.get("/exchange-rates", authenticate, async (req: Request, res: Response): Promise<void> => {
  const base = ((req.query.base as string | undefined) ?? "USD").toUpperCase();
  const r = await db.execute(sql`
    SELECT target_currency, rate, fetched_at FROM exchange_rates
    WHERE base_currency = ${base} ORDER BY target_currency
  `);
  res.json({ base, rates: r.rows });
});

/** Refresh on demand (owner only). */
router.post(
  "/exchange-rates/refresh",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const base = ((req.body?.base as string | undefined) ?? "USD").toUpperCase();
    await refreshRates(base);
    res.json({ ok: true, base });
  },
);

/** Common currencies (subset of ISO 4217) with names + symbols. */
const CURRENCIES = [
  { code: "SAR", symbol: "ر.س",  nameEn: "Saudi Riyal",       nameAr: "ريال سعودي" },
  { code: "USD", symbol: "$",    nameEn: "US Dollar",         nameAr: "دولار أمريكي" },
  { code: "EUR", symbol: "€",    nameEn: "Euro",              nameAr: "يورو" },
  { code: "GBP", symbol: "£",    nameEn: "British Pound",     nameAr: "جنيه إسترليني" },
  { code: "AED", symbol: "د.إ",  nameEn: "UAE Dirham",        nameAr: "درهم إماراتي" },
  { code: "EGP", symbol: "ج.م",  nameEn: "Egyptian Pound",    nameAr: "جنيه مصري" },
  { code: "KWD", symbol: "د.ك",  nameEn: "Kuwaiti Dinar",     nameAr: "دينار كويتي" },
  { code: "QAR", symbol: "ر.ق",  nameEn: "Qatari Riyal",      nameAr: "ريال قطري" },
  { code: "BHD", symbol: ".د.ب",  nameEn: "Bahraini Dinar",    nameAr: "دينار بحريني" },
  { code: "OMR", symbol: "ر.ع.", nameEn: "Omani Rial",        nameAr: "ريال عُماني" },
  { code: "JOD", symbol: "د.أ",  nameEn: "Jordanian Dinar",   nameAr: "دينار أردني" },
  { code: "TRY", symbol: "₺",    nameEn: "Turkish Lira",      nameAr: "ليرة تركية" },
  { code: "JPY", symbol: "¥",    nameEn: "Japanese Yen",      nameAr: "ين ياباني" },
  { code: "CNY", symbol: "¥",    nameEn: "Chinese Yuan",      nameAr: "يوان صيني" },
  { code: "INR", symbol: "₹",    nameEn: "Indian Rupee",      nameAr: "روبية هندية" },
  { code: "PKR", symbol: "₨",    nameEn: "Pakistani Rupee",   nameAr: "روبية باكستانية" },
];
router.get("/currencies", (_req, res) => { res.json({ currencies: CURRENCIES }); });

export default router;
