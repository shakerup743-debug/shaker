export interface Currency {
  code: string;
  name: string;
  nameAr: string;
  symbol: string;
  rate: number;
}

export const CURRENCIES: Currency[] = [
  { code: "SAR", name: "Saudi Riyal",       nameAr: "الريال السعودي",  symbol: "ر.س", rate: 1.0000 },
  { code: "USD", name: "US Dollar",          nameAr: "الدولار الأمريكي", symbol: "$",   rate: 0.2666 },
  { code: "AED", name: "UAE Dirham",         nameAr: "الدرهم الإماراتي", symbol: "د.إ", rate: 0.9791 },
  { code: "EGP", name: "Egyptian Pound",     nameAr: "الجنيه المصري",   symbol: "ج.م", rate: 8.3990 },
  { code: "KWD", name: "Kuwaiti Dinar",      nameAr: "الدينار الكويتي", symbol: "د.ك", rate: 0.0820 },
  { code: "QAR", name: "Qatari Riyal",       nameAr: "الريال القطري",   symbol: "ر.ق", rate: 0.9706 },
  { code: "BHD", name: "Bahraini Dinar",     nameAr: "الدينار البحريني", symbol: "د.ب", rate: 0.1004 },
];

export const STORAGE_KEY = "foodoro-currency";

export function getCurrencyByCode(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
}

export function convertPrice(sarAmount: number, currency: Currency): number {
  return Math.round(sarAmount * currency.rate * 100) / 100;
}

export function formatPrice(sarAmount: number, currency: Currency, lang: string): string {
  const converted = convertPrice(sarAmount, currency);
  const formatted = converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (lang === "ar") {
    return `${currency.symbol} ${formatted}`;
  }
  return `${currency.symbol} ${formatted}`;
}

export function getStoredCurrency(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "SAR";
  } catch {
    return "SAR";
  }
}

export function storeCurrency(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}
