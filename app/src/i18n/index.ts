import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import { createLanguageController } from "./languageController";
import { fontForLanguage, prepareLanguageFonts } from "./fonts";
import {
  readLanguagePreference,
  saveLanguagePreference,
} from "./languagePreference";
import {
  detectLanguage,
  LANGUAGE_METADATA,
  languageDirection,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
  type Language,
} from "./languages";

export {
  SUPPORTED_LANGUAGES,
  LANGUAGE_METADATA,
  type Language,
} from "./languages";

// Import only the build-time URLs, not executable locale modules. Browsers cache
// failed dynamic imports for the page lifetime; a JSON fetch can genuinely retry
// without reloading an open project. EN/FR already live in the initial bundle.
const catalogueUrls = import.meta.glob<string>(
  ["./locales/*.json", "!./locales/en.json", "!./locales/fr.json"],
  { query: "?url", import: "default", eager: true },
);
/** Only completed resource files appear in the picker during incremental delivery. */
export const AVAILABLE_LANGUAGES = SUPPORTED_LANGUAGES.filter(
  (language) =>
    language === "en" ||
    language === "fr" ||
    `./locales/${language}.json` in catalogueUrls,
);

function initialLanguage(): Language {
  const preferences =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return detectLanguage(
    readLanguagePreference(),
    preferences,
    AVAILABLE_LANGUAGES,
  );
}

const initial = initialLanguage();
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: initial === "fr" ? "fr" : "en",
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  load: "currentOnly",
  interpolation: { escapeValue: false },
});

const pending = new Map<Language, Promise<void>>();
async function prepareCatalogue(language: Language): Promise<void> {
  if (i18next.hasResourceBundle(language, "translation")) return;
  const existing = pending.get(language);
  if (existing) return existing;
  const url = catalogueUrls[`./locales/${language}.json`];
  if (!url) throw new Error(`Unavailable locale: ${language}`);
  const loading = fetch(url)
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Catalogue request failed: ${response.status}`);
      return response.json() as Promise<Record<string, unknown>>;
    })
    .then((resource) => {
      i18next.addResourceBundle(language, "translation", resource);
    })
    .finally(() => pending.delete(language));
  pending.set(language, loading);
  return loading;
}

export async function prepareLanguage(language: Language): Promise<void> {
  await Promise.all([
    prepareCatalogue(language),
    prepareLanguageFonts(language),
  ]);
}

function applyDocumentLanguage(language: Language): void {
  document.documentElement.lang = language;
  document.documentElement.dir = languageDirection(language);
  document.documentElement.dataset.script = LANGUAGE_METADATA[language].script;
  document.documentElement.style.setProperty(
    "--font-script",
    `"${fontForLanguage(language)?.family ?? "Instrument Sans Variable"}"`,
  );
  const manifest = document.querySelector<HTMLLinkElement>(
    'link[rel="manifest"]',
  );
  if (manifest) {
    manifest.href =
      language === "en"
        ? "/manifest.webmanifest"
        : `/manifest.${language}.webmanifest`;
  }
}

applyDocumentLanguage(resolveLanguage(i18next.language) ?? "en");
i18next.on("languageChanged", (value) => {
  const language = resolveLanguage(value) ?? "en";
  applyDocumentLanguage(language);
  saveLanguagePreference(language);
});

export const changeAppLanguage = createLanguageController(
  prepareLanguage,
  (language) => {
    // Resources are registered before this call, so i18next applies it synchronously.
    void i18next.changeLanguage(language);
  },
);

export const languageStartup = { failed: null as Language | null };

/** Restore a saved language before mounting the studio, keeping a usable fallback. */
export const languageReady: Promise<unknown> =
  initial === "en" || initial === "fr"
    ? Promise.resolve()
    : changeAppLanguage(initial).catch(() => {
        languageStartup.failed = initial;
        // Preserve the saved choice for an explicit retry.
      });

export default i18next;
