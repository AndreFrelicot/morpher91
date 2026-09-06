import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  isLanguage,
  languageDirection,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
} from "./languages";

describe("language resolution", () => {
  it.each([
    ["fr-CA", "fr"],
    ["de-DE", "de"],
    ["pt-BR", "pt-BR"],
    ["PT_br", "pt-BR"],
    ["pt", "pt-BR"],
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"],
    ["zh-Hans", "zh-Hans"],
    ["zh-Hans-CN", "zh-Hans"],
    ["zh", "zh-Hans"],
    ["  en-GB  ", "en"],
    ["ar-EG", "ar"],
    ["zh-TW", null],
    ["zh-HK", null],
    ["zh-Hant", null],
    ["zh-Hant-CN", null],
    ["pt-PT", null],
    ["pt-AO", null],
    ["unknown", null],
    ["", null],
    [null, null],
  ])("resolves %s to %s", (input, expected) => {
    expect(resolveLanguage(input)).toBe(expected);
  });

  it("prioritizes a stored compatible choice, then ordered browser preferences", () => {
    expect(detectLanguage("fr", ["de", "en"])).toBe("fr");
    expect(detectLanguage("unknown", ["zh-TW", "pt-PT", "de-DE"])).toBe("de");
    expect(detectLanguage(null, ["pt-PT", "zh-Hant", "unknown"])).toBe("en");
    expect(detectLanguage("ja", ["de", "fr"], ["en", "fr"])).toBe("fr");
    expect(detectLanguage(null, [])).toBe("en");
  });

  it("covers exactly the planned locales and gives only Arabic RTL direction", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(16);
    for (const language of SUPPORTED_LANGUAGES) {
      expect(isLanguage(language)).toBe(true);
      expect(resolveLanguage(language)).toBe(language);
      expect(languageDirection(language)).toBe(
        language === "ar" ? "rtl" : "ltr",
      );
    }
    expect(isLanguage("toString")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});
