// QR-order fraud detection: device fingerprint, risk scoring, WhatsApp OTP.
//
// Risk thresholds (≥):
//   40  → require OTP via WhatsApp
//   60  → also require cashier manual approval
//   80  → auto-block (HTTP 403) and add to blacklist

import crypto from "crypto";
import type pg from "pg";

export const RISK_OTP        = 40;
export const RISK_APPROVAL   = 60;
export const RISK_AUTO_BLOCK = 80;

// ── Saudi phone validation (05XXXXXXXX or +9665XXXXXXXX) ───────────────────
const SAUDI_PHONE_RE = /^(?:05\d{8}|\+9665\d{8}|009665\d{8})$/;
export function validateSaudiPhone(raw: string): { ok: boolean; normalized?: string; error?: string } {
  if (typeof raw !== "string") return { ok: false, error: "رقم الجوال مطلوب" };
  const cleaned = raw.replace(/\s|-/g, "");
  if (!SAUDI_PHONE_RE.test(cleaned)) {
    return { ok: false, error: "رقم جوال سعودي صحيح مطلوب (05xxxxxxxx)" };
  }
  // Normalize to +9665XXXXXXXX
  let n = cleaned;
  if (n.startsWith("05")) n = "+966" + n.slice(1);
  else if (n.startsWith("009665")) n = "+9665" + n.slice(5);
  return { ok: true, normalized: n };
}

// ── Device fingerprint hashing ─────────────────────────────────────────────
// The client sends extra signals via body (timezone, screen, language) and
// we combine them with the UA/Accept headers, then SHA-256 the lot.
export interface FingerprintInputs {
  userAgent?: string | null;
  acceptLanguage?: string | null;
  timezone?: string;
  screenResolution?: string;
  clientHints?: Record<string, unknown>;
}
export function fingerprintHash(inp: FingerprintInputs): string {
  const norm = {
    ua: inp.userAgent ?? "",
    al: inp.acceptLanguage ?? "",
    tz: inp.timezone ?? "",
    sr: inp.screenResolution ?? "",
    ch: inp.clientHints ?? {},
  };
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

// ── Risk scoring ───────────────────────────────────────────────────────────
export interface RiskScanCtx {
  tenantId: number;
  qrToken: string;
  deviceFingerprint: string;
  ipAddress: string;
  scannedAt: Date;
  tableNumber?: string | null;
}
export interface RiskOrderCtx {
  customerName: string;
  customerPhone: string;
  itemsCount: number;
  total: number;
}
export interface RiskResult {
  score: number;
  flags: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresOtp: boolean;
  requiresApproval: boolean;
  shouldBlock: boolean;
}

export async function calculateRiskScore(
  pool: pg.Pool,
  scan: RiskScanCtx,
  order: RiskOrderCtx,
): Promise<RiskResult> {
  let score = 0;
  const flags: string[] = [];

  // 1) Blacklist hit on QR token / device / IP / phone → auto-critical
  const bl = await pool.query(
    `SELECT blacklist_type, value FROM security_blacklist
     WHERE tenant_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (
         (blacklist_type = 'qr_token'           AND value = $2) OR
         (blacklist_type = 'device_fingerprint' AND value = $3) OR
         (blacklist_type = 'ip_address'         AND value = $4) OR
         (blacklist_type = 'phone'              AND value = $5)
       )
     LIMIT 1`,
    [scan.tenantId, scan.qrToken, scan.deviceFingerprint, scan.ipAddress, order.customerPhone],
  );
  if (bl.rowCount && bl.rowCount > 0) {
    return {
      score: 100, flags: [`blacklisted_${bl.rows[0].blacklist_type}`],
      riskLevel: "critical", requiresOtp: true, requiresApproval: true, shouldBlock: true,
    };
  }

  // 2) Device previously involved in fraud
  const devFraud = await pool.query(
    `SELECT COUNT(*)::int AS c FROM fraud_attempts
     WHERE device_fingerprint = $1 AND detected_at > NOW() - INTERVAL '7 days'`,
    [scan.deviceFingerprint],
  );
  if (devFraud.rows[0]?.c > 0) {
    score += 35; flags.push(`device_fraud_history:${devFraud.rows[0].c}`);
  }

  // 3) Time of day — restaurants generally don't operate 0-5am
  const hour = scan.scannedAt.getHours();
  if (hour < 6 || hour > 23) { score += 10; flags.push(`unusual_hour:${hour}`); }

  // 4) Repetition: same QR scanned > 8 times in last hour
  const recentTokenScans = await pool.query(
    `SELECT COUNT(*)::int AS c FROM qr_scans
     WHERE qr_token = $1 AND scanned_at > NOW() - INTERVAL '1 hour'`,
    [scan.qrToken],
  );
  if (recentTokenScans.rows[0]?.c > 8) {
    score += 25; flags.push(`qr_scanned_${recentTokenScans.rows[0].c}_in_1h`);
  }

  // 5) Same device scanning many different QRs in 10 min (token farming)
  const devDiffQrs = await pool.query(
    `SELECT COUNT(DISTINCT qr_token)::int AS c FROM qr_scans
     WHERE device_fingerprint = $1 AND scanned_at > NOW() - INTERVAL '10 minutes'`,
    [scan.deviceFingerprint],
  );
  if (devDiffQrs.rows[0]?.c > 3) {
    score += 25; flags.push(`device_scanned_${devDiffQrs.rows[0].c}_qrs_10m`);
  }

  // 6) Order anomalies
  if (order.total > 5000) { score += 15; flags.push("high_value_order"); }
  if (order.itemsCount > 50) { score += 15; flags.push("high_item_count"); }
  if (!order.customerName.trim()) { score += 25; flags.push("missing_customer_name"); }

  // 7) Behaviour: same name + many distinct IPs in 24h = coordinated group
  const nameIps = await pool.query(
    `SELECT COUNT(DISTINCT ip_address)::int AS c FROM qr_order_security
     WHERE tenant_id = $1 AND customer_name = $2
       AND created_at > NOW() - INTERVAL '1 day'`,
    [scan.tenantId, order.customerName],
  );
  if (nameIps.rows[0]?.c > 3) {
    score += 25; flags.push(`same_name_${nameIps.rows[0].c}_ips`);
  }

  // 8) Unpaid orders piling up on the same QR token last 30 min
  //    Treats > 4 in-flight orders as suspicious.
  const unpaid = await pool.query(
    `SELECT COUNT(*)::int AS c FROM qr_order_security qos
     JOIN orders o ON o.id = qos.order_id
     WHERE qos.tenant_id = $1
       AND qos.created_at > NOW() - INTERVAL '30 minutes'
       AND o.status NOT IN ('paid', 'completed', 'cancelled')
       AND qr_scan_id IN (SELECT id FROM qr_scans WHERE qr_token = $2)`,
    [scan.tenantId, scan.qrToken],
  );
  if (unpaid.rows[0]?.c > 4) {
    score += 15; flags.push(`qr_unpaid_pileup:${unpaid.rows[0].c}`);
  }

  const finalScore = Math.min(score, 100);
  const riskLevel: RiskResult["riskLevel"] =
    finalScore >= RISK_AUTO_BLOCK ? "critical" :
    finalScore >= RISK_APPROVAL   ? "high"     :
    finalScore >= RISK_OTP        ? "medium"   : "low";

  return {
    score: finalScore,
    flags,
    riskLevel,
    requiresOtp:      finalScore >= RISK_OTP,
    requiresApproval: finalScore >= RISK_APPROVAL,
    shouldBlock:      finalScore >= RISK_AUTO_BLOCK,
  };
}

// ── WhatsApp OTP send/verify ───────────────────────────────────────────────
// Provider is pluggable. Until Twilio / Meta credentials are wired in via env,
// we stub by logging to console — the verify flow still works end-to-end and
// the OTP is available for testers via backend logs.
export async function sendWhatsAppOtp(opts: {
  pool: pg.Pool;
  tenantId: number;
  phoneNumber: string;
  orderSecId: number;
}): Promise<{ id: number; expiresAtIso: string }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Invalidate any prior unused OTPs for this order
  await opts.pool.query(
    `UPDATE whatsapp_otps SET is_used = true, used_at = NOW()
     WHERE order_sec_id = $1 AND is_used = false`,
    [opts.orderSecId],
  );

  const ins = await opts.pool.query(
    `INSERT INTO whatsapp_otps (tenant_id, phone_number, otp_code, order_sec_id, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [opts.tenantId, opts.phoneNumber, code, opts.orderSecId, expiresAt],
  );

  // ── Provider dispatch ────────────────────────────────────────────────
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_WHATSAPP_FROM) {
    // TODO: wire actual Twilio WhatsApp call. Skipped now — credentials absent.
  }
  // Fallback: emit code to backend log for manual testing.
  console.log(`📲 [WhatsApp-OTP stub] to=${opts.phoneNumber} order_sec=${opts.orderSecId} code=${code}`);

  return { id: ins.rows[0].id, expiresAtIso: expiresAt.toISOString() };
}

export async function verifyWhatsAppOtp(opts: {
  pool: pg.Pool;
  phoneNumber: string;
  code: string;
  orderSecId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const r = await opts.pool.query(
    `SELECT * FROM whatsapp_otps
     WHERE phone_number = $1 AND order_sec_id = $2
       AND is_used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [opts.phoneNumber, opts.orderSecId],
  );
  if (!r.rowCount) return { ok: false, error: "OTP expired or not found" };

  const row = r.rows[0];
  if (row.attempts >= row.max_attempts) {
    return { ok: false, error: "Too many attempts" };
  }

  if (row.otp_code !== opts.code.trim()) {
    await opts.pool.query(`UPDATE whatsapp_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return { ok: false, error: "Wrong code" };
  }

  await opts.pool.query(
    `UPDATE whatsapp_otps SET is_used = true, used_at = NOW() WHERE id = $1`,
    [row.id],
  );
  await opts.pool.query(
    `UPDATE qr_order_security
     SET otp_verified = true, otp_verified_at = NOW(),
         status = CASE
                    WHEN risk_level IN ('high', 'critical') AND cashier_approval IS NULL
                      THEN 'pending_approval'
                    ELSE 'accepted'
                  END
     WHERE id = $1`,
    [opts.orderSecId],
  );
  return { ok: true };
}
