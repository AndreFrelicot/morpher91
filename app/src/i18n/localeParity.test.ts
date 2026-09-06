import { formatNumber } from "./formatters";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import { SUPPORTED_LANGUAGES } from "./languages";

const resources = import.meta.glob<Record<string, unknown>>(
  "./locales/*.json",
  {
    eager: true,
    import: "default",
  },
);
const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function flatten(
  node: Record<string, unknown>,
  prefix = "",
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const entry of flatten(value as Record<string, unknown>, path))
        out.set(...entry);
    } else out.set(path, value);
  }
  return out;
}

function tokens(value: string, pattern: RegExp): string[] {
  return Array.from(value.matchAll(pattern), (match) => match[1].trim()).sort();
}

const source = flatten(en);
const families = new Set(
  [...source.keys()]
    .filter((key) => pluralSuffix.test(key))
    .map((key) => key.replace(pluralSuffix, "")),
);
const sourceKeys = [...source.keys()]
  .filter((key) => !pluralSuffix.test(key))
  .sort();

for (const [file, resource] of Object.entries(resources)) {
  const language = file.slice("./locales/".length, -".json".length);
  const values = flatten(resource);
  describe(`${language} locale completeness`, () => {
    it("belongs to the registry and has exactly the source's non-plural keys", () => {
      expect(SUPPORTED_LANGUAGES).toContain(language);
      expect(
        [...values.keys()].filter((key) => !pluralSuffix.test(key)).sort(),
      ).toEqual(sourceKeys);
      expect(
        [
          ...new Set(
            [...values.keys()]
              .filter((key) => pluralSuffix.test(key))
              .map((key) => key.replace(pluralSuffix, "")),
          ),
        ].sort(),
      ).toEqual([...families].sort());
    });

    it("has non-empty strings with matching interpolation variables and rich-text tags", () => {
      for (const [key, value] of values) {
        expect(typeof value === "string" && value.trim().length > 0, key).toBe(
          true,
        );
        const reference =
          source.get(key) ??
          source.get(`${key.replace(pluralSuffix, "")}_other`);
        expect(typeof reference, key).toBe("string");
        for (const pattern of [
          /\{\{\s*([^}]+?)\s*\}\}/g,
          /(<\/?[A-Za-z0-9]+(?:\s[^<>]*)?\s*\/?>)/g,
        ]) {
          expect(tokens(value as string, pattern), key).toEqual(
            tokens(reference as string, pattern),
          );
        }
      }
    });

    it("provides every native plural category and actually selects it at runtime", async () => {
      const rules = new Intl.PluralRules(language);
      const categories = rules.resolvedOptions().pluralCategories;
      const instance = createInstance();
      await instance.init({
        lng: language,
        fallbackLng: false,
        resources: { [language]: { translation: resource } },
        interpolation: { escapeValue: false },
      });
      for (const family of families) {
        expect(
          [...values.keys()]
            .filter((key) => key.startsWith(`${family}_`))
            .sort(),
          family,
        ).toEqual(categories.map((category) => `${family}_${category}`).sort());
        for (const count of [0, 1, 2, 3, 5, 11, 21, 100, 1.5, 1_000_000]) {
          const expectedKey = `${family}_${rules.select(count)}`;
          const details = instance.t(family, "__MISSING__", {
            count,
            returnDetails: true,
          });
          expect(details.exactUsedKey, `${family}/${count}`).toBe(expectedKey);
          expect(details.res).not.toMatch(/\{\{|\}\}/);
          expect(details.res, `${family}/${count}`).toBe(
            (values.get(expectedKey) as string).replaceAll(
              "{{count, number}}",
              formatNumber(count, language),
            ),
          );
        }
      }
    });
  });
}
