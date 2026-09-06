import type { Language } from "./languages";

/** Only the latest fully prepared request can change the visible language. */
export function createLanguageController(
  prepare: (language: Language) => Promise<void>,
  apply: (language: Language) => void,
) {
  let request = 0;
  return async (language: Language): Promise<boolean> => {
    const current = ++request;
    try {
      await prepare(language);
    } catch (error) {
      if (current !== request) return false;
      throw error;
    }
    if (current !== request) return false;
    apply(language);
    return true;
  };
}
