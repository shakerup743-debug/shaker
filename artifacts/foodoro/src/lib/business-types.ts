/**
 * Allowed restaurant business types (FoodPro is restaurant-only).
 * Each entry exposes a unique slug plus AR/EN labels for the signup form.
 *
 * The signup validator REJECTS any custom value that doesn't look restaurant-related.
 */

export interface BusinessType {
  slug: string;
  ar: string;
  en: string;
}

export const RESTAURANT_BUSINESS_TYPES: BusinessType[] = [
  { slug: "traditional",   ar: "مطعم تقليدي",           en: "Traditional Restaurant" },
  { slug: "fast_food",     ar: "وجبات سريعة",            en: "Fast Food" },
  { slug: "cafe",          ar: "مقهى / كافيه",           en: "Café / Coffee Shop" },
  { slug: "bakery",        ar: "مخبز",                   en: "Bakery" },
  { slug: "sweets",        ar: "حلويات",                 en: "Sweets Shop" },
  { slug: "juice_bar",     ar: "عصائر ومشروبات",          en: "Juice Bar" },
  { slug: "buffet",        ar: "بوفيه مفتوح",            en: "Buffet Restaurant" },
  { slug: "takeaway",      ar: "مطعم تيك أواي",          en: "Takeaway Only" },
  { slug: "cloud_kitchen", ar: "مطبخ سحابي / توصيل فقط",  en: "Cloud Kitchen (Delivery only)" },
  { slug: "food_truck",    ar: "عربة طعام (فود ترك)",    en: "Food Truck" },
  { slug: "seafood",       ar: "مطعم مأكولات بحرية",     en: "Seafood Restaurant" },
  { slug: "grill",         ar: "مطعم مشاوي",             en: "Grill / BBQ House" },
  { slug: "pizza",         ar: "مطعم بيتزا",              en: "Pizzeria" },
  { slug: "burger",        ar: "مطعم برجر",               en: "Burger Restaurant" },
  { slug: "shawarma",      ar: "مطعم شاورما",             en: "Shawarma Spot" },
  { slug: "asian",         ar: "مطعم آسيوي",              en: "Asian Cuisine" },
  { slug: "italian",       ar: "مطعم إيطالي",             en: "Italian Cuisine" },
  { slug: "indian",        ar: "مطعم هندي",               en: "Indian Cuisine" },
  { slug: "turkish",       ar: "مطعم تركي",               en: "Turkish Cuisine" },
  { slug: "gulf",          ar: "مطعم خليجي/شعبي",         en: "Gulf / Local Cuisine" },
  { slug: "lebanese",      ar: "مطعم لبناني / شامي",      en: "Lebanese / Levantine" },
  { slug: "indian_subc",   ar: "مطعم باكستاني / هندي",    en: "Pakistani / Indian Sub-cont." },
  { slug: "vegetarian",    ar: "مطعم نباتي",              en: "Vegetarian / Vegan" },
  { slug: "dessert_shop",  ar: "بوظة وآيس كريم",          en: "Ice-cream & Desserts" },
  { slug: "other",         ar: "أخرى — أدخل يدوياً",      en: "Other — enter manually" },
];

/** Keywords that PROVE a custom business type is restaurant-related (case-insensitive). */
const RESTAURANT_KEYWORDS: string[] = [
  // Arabic
  "مطعم", "مقهى", "كافيه", "كافي", "مخبز", "مخابز", "فرن", "حلويات", "حلوى",
  "عصائر", "عصير", "بوفيه", "تيك", "توصيل", "طعام", "أطعمة", "اطعمة",
  "مأكولات", "ماكولات", "مشاوي", "مشويات", "بيتزا", "برجر", "شاورما",
  "فلافل", "شاي", "قهوة", "وجبات", "طبخ", "أكل", "اكل", "مطبخ", "مطابخ",
  "بوظة", "آيس", "ايس", "كريم", "كنافة", "كباب", "كبة", "فطائر", "معجنات",
  "ساندويتش", "بيكري", "كافتيريا", "كنتين", "كشري", "مأكل", "خبز",
  "دجاج", "لحم", "سمك", "مشاوي", "تنور", "بقلاوة",
  // English
  "restaurant", "cafe", "café", "coffee", "bakery", "bakeries", "sweets",
  "candy", "juice", "smoothie", "buffet", "takeaway", "take-away", "delivery",
  "food", "kitchen", "kitchens", "pizza", "pizzeria", "burger", "burgers",
  "shawarma", "falafel", "grill", "bbq", "barbecue", "dining", "diner",
  "eatery", "bistro", "cuisine", "meal", "meals", "snack", "snacks",
  "deli", "delicatessen", "patisserie", "bakeshop", "creperie", "ice",
  "cream", "gelato", "dessert", "desserts", "donut", "doughnut", "bagel",
  "noodle", "sushi", "ramen", "kebab", "shisha", "hookah", "cafeteria",
  "canteen", "lounge", "steakhouse", "seafood", "chicken", "wings",
  "biryani", "curry", "tandoor", "kabsa", "mandi",
];

const NON_RESTAURANT_KEYWORDS: string[] = [
  // Arabic
  "ملابس", "أزياء", "اقمشة", "أقمشة", "احذية", "أحذية", "سيارات", "عقارات",
  "صيدلية", "أدوية", "ادوية", "مستوصف", "مستشفى", "عيادة", "محاماة",
  "مكتب", "هندسة", "كهرباء", "سباكة", "مقاولات", "تأمين", "تامين",
  "بنك", "صرافة", "تجارة", "خياط", "اثاث", "أثاث", "مفروشات", "ديكور",
  "خدمات", "نظافة", "غسيل", "كاراج", "ورشة", "تكنولوجيا", "كمبيوتر",
  "تعليم", "مدرسة", "جامعة", "حضانة", "صالون", "حلاق", "تجميل",
  // English
  "clothing", "fashion", "apparel", "shoes", "footwear", "cars", "auto",
  "real estate", "realty", "pharmacy", "drug", "drugstore", "clinic",
  "hospital", "lawyer", "law firm", "consulting", "engineering",
  "electric", "plumbing", "construction", "insurance", "bank", "exchange",
  "trading", "tailor", "furniture", "decor", "interior", "laundry",
  "carwash", "garage", "workshop", "tech", "computer", "software", "it",
  "school", "university", "kindergarten", "salon", "barber", "beauty",
  "spa", "gym", "fitness", "hotel", "motel", "travel",
];

const ALLOWED_SLUGS = new Set(RESTAURANT_BUSINESS_TYPES.map((b) => b.slug));

export interface BusinessTypeValidation {
  ok: boolean;
  reason?: string; // user-facing message
}

/**
 * Validates either:
 *   - a predefined slug from RESTAURANT_BUSINESS_TYPES  (always allowed except "other")
 *   - a free-text custom value (when slug === "other") — must contain a restaurant keyword
 *     and must NOT contain a clearly non-restaurant keyword.
 */
export function validateBusinessType(
  slug: string,
  customText: string | undefined,
  lang: "ar" | "en",
): BusinessTypeValidation {
  if (!ALLOWED_SLUGS.has(slug)) {
    return {
      ok: false,
      reason: lang === "ar"
        ? "نوع النشاط غير صالح."
        : "Invalid business type.",
    };
  }

  if (slug !== "other") {
    return { ok: true };
  }

  // "other" => need custom text
  const text = (customText ?? "").trim();
  if (text.length < 2) {
    return {
      ok: false,
      reason: lang === "ar"
        ? "الرجاء كتابة نوع نشاطك المطعمي."
        : "Please describe your restaurant business.",
    };
  }
  if (text.length > 80) {
    return {
      ok: false,
      reason: lang === "ar"
        ? "نوع النشاط طويل جداً."
        : "Business type too long.",
    };
  }

  const lower = text.toLowerCase();

  // Reject obvious non-restaurant industries first
  for (const bad of NON_RESTAURANT_KEYWORDS) {
    if (lower.includes(bad.toLowerCase())) {
      return {
        ok: false,
        reason: lang === "ar"
          ? "هذا النظام مخصص للمطاعم فقط. لا يمكن تسجيل نشاط غير مطعمي."
          : "FoodPro is for restaurants only. Non-restaurant businesses cannot register.",
      };
    }
  }

  // Must contain at least one restaurant keyword
  const matched = RESTAURANT_KEYWORDS.some((kw) =>
    lower.includes(kw.toLowerCase()),
  );
  if (!matched) {
    return {
      ok: false,
      reason: lang === "ar"
        ? "نوع النشاط يجب أن يكون مطعمياً (مثل: مطعم، مقهى، حلويات، عصائر…)."
        : "Business type must be restaurant-related (e.g. restaurant, café, bakery, juice…).",
    };
  }

  return { ok: true };
}
