import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGE_METADATA } from "@/i18n/languages";

const app = join(dirname(fileURLToPath(import.meta.url)), "../..");
const resources = import.meta.glob<{ about: { description: string } }>(
  "../i18n/locales/*.json",
  { eager: true, import: "default" },
);

describe("localized PWA manifests", () => {
  it("generates every available locale from the same registry without changing app identity", () => {
    const output = mkdtempSync(join(tmpdir(), "morpher-manifests-"));
    try {
      execFileSync(process.execPath, [
        join(app, "scripts/generate-pwa-manifests.mjs"),
        output,
      ]);
      const expectedFiles = [];
      for (const [path, resource] of Object.entries(resources)) {
        const language = path
          .split("/")
          .at(-1)!
          .replace(".json", "") as keyof typeof LANGUAGE_METADATA;
        const filename =
          language === "en"
            ? "manifest.webmanifest"
            : `manifest.${language}.webmanifest`;
        expectedFiles.push(filename);
        const manifest = JSON.parse(
          readFileSync(join(output, filename), "utf8"),
        );
        expect(manifest).toMatchObject({
          id: "/",
          scope: "/",
          start_url: "/",
          name: "Morpher91",
          short_name: "Morpher91",
          lang: language,
          dir: LANGUAGE_METADATA[language].direction,
          description: resource.about.description,
        });
        for (const icon of manifest.icons)
          expect(existsSync(join(app, "public", icon.src))).toBe(true);
        const checkedIn = JSON.parse(
          readFileSync(join(app, "public", filename), "utf8"),
        );
        expect(checkedIn, filename).toEqual(manifest);
      }
      expect(readdirSync(output).sort()).toEqual(expectedFiles.sort());
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
