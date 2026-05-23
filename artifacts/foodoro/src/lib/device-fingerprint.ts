// Client-side device fingerprint (matches backend's `fingerprintHash` shape).
// Keeps no PII — only stable platform signals.
export interface FingerprintPayload {
  userAgent: string;
  acceptLanguage: string;
  timezone: string;
  screenResolution: string;
  clientHints: {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    platform?: string;
    timeZoneOffset?: number;
    colorDepth?: number;
  };
}

export function buildFingerprintPayload(): FingerprintPayload {
  const nav = navigator;
  return {
    userAgent: nav.userAgent,
    acceptLanguage: nav.language || (nav.languages?.[0] ?? ""),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh",
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    clientHints: {
      hardwareConcurrency: nav.hardwareConcurrency,
      // @ts-ignore — deviceMemory non-standard but widely supported
      deviceMemory: nav.deviceMemory,
      platform: nav.platform,
      timeZoneOffset: new Date().getTimezoneOffset(),
      colorDepth: window.screen.colorDepth,
    },
  };
}

/** Saudi phone validation matching backend rule (05XXXXXXXX or +9665XXXXXXXX) */
export function isValidSaudiPhone(raw: string): boolean {
  const cleaned = raw.replace(/\s|-/g, "");
  return /^(?:05\d{8}|\+9665\d{8}|009665\d{8})$/.test(cleaned);
}

export function maskPhone(phone: string): string {
  if (phone.length < 5) return phone;
  return phone.slice(0, 4) + "*****" + phone.slice(-2);
}
