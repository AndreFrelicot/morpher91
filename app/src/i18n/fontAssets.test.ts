import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fonts from "./fonts.json";
import sharedFonts from "./shared-fonts.json";
import baseFonts from "./base-font-coverage.json";
import { LANGUAGE_METADATA, type Language } from "./languages";

const app = join(dirname(fileURLToPath(import.meta.url)), "../..");
const resources = import.meta.glob<Record<string, unknown>>(
  "./locales/*.json",
  { eager: true, import: "default" },
);
function points(ranges: string): Set<number> {
  const result = new Set<number>();
  for (const range of ranges.split(",")) {
    const [start, end = start] = range
      .slice(2)
      .split("-")
      .map((value) => Number.parseInt(value, 16));
    for (let point = start; point <= end; point++) result.add(point);
  }
  return result;
}
function strings(value: unknown): string {
  return typeof value === "string"
    ? value
    : Object.values(value as object)
        .map(strings)
        .join("");
}
function digest(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
const baseCoverage = new Set(
  [...baseFonts, ...sharedFonts].flatMap((font) => [
    ...points(font.unicodeRange),
  ]),
);

describe("self-hosted font assets", () => {
  it("ties coverage to exact bundled binaries and ships the font licences", () => {
    for (const font of baseFonts)
      expect(digest(join(app, font.file))).toBe(font.sha256);
    for (const spec of Object.values(fonts)) {
      for (const font of [spec.full, spec.native]) {
        const path = join(app, "public", font.url);
        expect(digest(path), font.url).toBe(font.sha256);
        expect(readFileSync(path).length, font.url).toBe(font.bytes);
      }
      expect(readFileSync(join(app, "public", spec.license), "utf8")).toContain(
        "SIL OPEN FONT LICENSE",
      );
    }
    for (const font of sharedFonts) {
      expect(digest(join(app, "public", font.url))).toBe(font.sha256);
      expect(readFileSync(join(app, "public", font.license), "utf8")).toContain(
        "SIL OPEN FONT LICENSE",
      );
    }
  });

  it("covers every registry script and every native language name", () => {
    for (const meta of Object.values(LANGUAGE_METADATA)) {
      const spec = fonts[meta.script as keyof typeof fonts];
      if (meta.script !== "latin") expect(spec, meta.script).toBeDefined();
      const coverage = spec ? points(spec.native.unicodeRange) : baseCoverage;
      for (const character of meta.nativeName)
        expect(coverage.has(character.codePointAt(0)!), meta.nativeName).toBe(
          true,
        );
    }
  });

  for (const [file, resource] of Object.entries(resources)) {
    const lang = file.split("/").at(-1)!.replace(".json", "") as Language;
    it(`covers all visible ${lang} catalogue glyphs without system fonts`, () => {
      const script = LANGUAGE_METADATA[lang].script as keyof typeof fonts;
      const coverage = new Set([
        ...baseCoverage,
        ...points(fonts[script]?.full.unicodeRange ?? "U+0"),
      ]);
      const missing = [...new Set(strings(resource))].filter(
        (character) =>
          !/[\s\p{Cc}\p{Cf}]/u.test(character) &&
          !coverage.has(character.codePointAt(0)!),
      );
      expect(
        missing.map(
          (character) =>
            `${character} U+${character.codePointAt(0)!.toString(16)}`,
        ),
      ).toEqual([]);
    });
  }
});
