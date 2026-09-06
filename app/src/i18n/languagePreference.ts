import { LANGUAGE_STORAGE_KEY, type Language } from "./languages";

export function readLanguagePreference(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLanguagePreference(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage is optional; the current session can still change language.
  }
}
