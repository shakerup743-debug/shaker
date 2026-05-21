import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { SUPPORTED_LANGUAGES, isRtl } from "./languages";

// Static imports so the build bundler tree-shakes properly and dev HMR works.
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import hi from "./locales/hi.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import it from "./locales/it.json";
import ko from "./locales/ko.json";
import tr from "./locales/tr.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import sv from "./locales/sv.json";
import id from "./locales/id.json";
import th from "./locales/th.json";
import vi from "./locales/vi.json";
import el from "./locales/el.json";
import he from "./locales/he.json";
import fa from "./locales/fa.json";
import ur from "./locales/ur.json";
import bn from "./locales/bn.json";
import sw from "./locales/sw.json";

const STORAGE_KEY = "foodoro-lang";

const resources = {
  en: { translation: en }, ar: { translation: ar }, es: { translation: es },
  fr: { translation: fr }, de: { translation: de }, zh: { translation: zh },
  ja: { translation: ja }, hi: { translation: hi }, pt: { translation: pt },
  ru: { translation: ru }, it: { translation: it }, ko: { translation: ko },
  tr: { translation: tr }, nl: { translation: nl }, pl: { translation: pl },
  sv: { translation: sv }, id: { translation: id }, th: { translation: th },
  vi: { translation: vi }, el: { translation: el }, he: { translation: he },
  fa: { translation: fa }, ur: { translation: ur }, bn: { translation: bn },
  sw: { translation: sw },
};

const validCodes = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
const saved = localStorage.getItem(STORAGE_KEY);
const initialLang = saved && validCodes.has(saved) ? saved : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: initialLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Apply direction on every language change.
function applyDirection(code: string): void {
  const html = document.documentElement;
  html.lang = code;
  html.dir = isRtl(code) ? "rtl" : "ltr";
}
applyDirection(initialLang);
i18n.on("languageChanged", (code) => {
  localStorage.setItem(STORAGE_KEY, code);
  applyDirection(code);
});

export default i18n;
