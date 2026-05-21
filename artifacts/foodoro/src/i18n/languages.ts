/**
 * 25 supported languages — registered in i18n index.
 * `rtl` controls page direction. Stub locales (everything except en/ar)
 * currently inherit English copy and will be translated by the team / via
 * an automated pipeline; the keys & order are identical so partial overrides
 * are safe to ship.
 */
export interface AppLanguage {
  code: string;
  nameEn: string;
  nameNative: string;
  flag: string;
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: AppLanguage[] = [
  { code: "en", nameEn: "English",     nameNative: "English",     flag: "🇬🇧" },
  { code: "ar", nameEn: "Arabic",      nameNative: "العربية",     flag: "🇸🇦", rtl: true },
  { code: "es", nameEn: "Spanish",     nameNative: "Español",     flag: "🇪🇸" },
  { code: "fr", nameEn: "French",      nameNative: "Français",    flag: "🇫🇷" },
  { code: "de", nameEn: "German",      nameNative: "Deutsch",     flag: "🇩🇪" },
  { code: "zh", nameEn: "Chinese",     nameNative: "中文",        flag: "🇨🇳" },
  { code: "ja", nameEn: "Japanese",    nameNative: "日本語",      flag: "🇯🇵" },
  { code: "hi", nameEn: "Hindi",       nameNative: "हिन्दी",       flag: "🇮🇳" },
  { code: "pt", nameEn: "Portuguese",  nameNative: "Português",   flag: "🇵🇹" },
  { code: "ru", nameEn: "Russian",     nameNative: "Русский",     flag: "🇷🇺" },
  { code: "it", nameEn: "Italian",     nameNative: "Italiano",    flag: "🇮🇹" },
  { code: "ko", nameEn: "Korean",      nameNative: "한국어",      flag: "🇰🇷" },
  { code: "tr", nameEn: "Turkish",     nameNative: "Türkçe",      flag: "🇹🇷" },
  { code: "nl", nameEn: "Dutch",       nameNative: "Nederlands",  flag: "🇳🇱" },
  { code: "pl", nameEn: "Polish",      nameNative: "Polski",      flag: "🇵🇱" },
  { code: "sv", nameEn: "Swedish",     nameNative: "Svenska",     flag: "🇸🇪" },
  { code: "id", nameEn: "Indonesian",  nameNative: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "th", nameEn: "Thai",        nameNative: "ไทย",         flag: "🇹🇭" },
  { code: "vi", nameEn: "Vietnamese",  nameNative: "Tiếng Việt",  flag: "🇻🇳" },
  { code: "el", nameEn: "Greek",       nameNative: "Ελληνικά",    flag: "🇬🇷" },
  { code: "he", nameEn: "Hebrew",      nameNative: "עברית",       flag: "🇮🇱", rtl: true },
  { code: "fa", nameEn: "Persian",     nameNative: "فارسی",       flag: "🇮🇷", rtl: true },
  { code: "ur", nameEn: "Urdu",        nameNative: "اردو",        flag: "🇵🇰", rtl: true },
  { code: "bn", nameEn: "Bengali",     nameNative: "বাংলা",       flag: "🇧🇩" },
  { code: "sw", nameEn: "Swahili",     nameNative: "Kiswahili",   flag: "🇰🇪" },
];

export const RTL_CODES = new Set(SUPPORTED_LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

export function isRtl(code: string): boolean {
  return RTL_CODES.has(code);
}
