import languages from "./languages.json";

export type Language = keyof typeof languages;
export const SUPPORTED_LANGUAGES = Object.keys(languages) as Language[];
export const LANGUAGE_METADATA = languages;
export const LANGUAGE_STORAGE_KEY = "bwm.lang";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && Object.hasOwn(languages, value);
}

/** Resolve compatible regional preferences without conflating writing systems. */
export function resolveLanguage(
  value: string | null | undefined,
): Language | null {
  if (!value) return null;
  const code = value.trim().replaceAll("_", "-").toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find(
    (language) => language.toLowerCase() === code,
  );
  if (exact) return exact;
  const parts = code.split("-");
  if (parts[0] === "zh") {
    if (parts.some((part) => ["hant", "tw", "hk", "mo"].includes(part)))
      return null;
    return code === "zh" ||
      parts.some((part) => ["hans", "cn", "sg"].includes(part))
      ? "zh-Hans"
      : null;
  }
  // Generic Portuguese uses Brazilian; pt-PT can fall through to another preference.
  if (parts[0] === "pt")
    return code === "pt" || parts[1] === "br" ? "pt-BR" : null;
  return isLanguage(parts[0]) ? parts[0] : null;
}

export function detectLanguage(
  stored: string | null,
  preferences: readonly string[],
  available: readonly Language[] = SUPPORTED_LANGUAGES,
): Language {
  for (const value of [stored, ...preferences]) {
    const language = resolveLanguage(value);
    if (language && available.includes(language)) return language;
  }
  return "en";
}

export function languageDirection(language: Language): "ltr" | "rtl" {
  return languages[language].direction === "rtl" ? "rtl" : "ltr";
}
