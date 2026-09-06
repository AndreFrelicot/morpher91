import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const registry = JSON.parse(
  readFileSync(new URL("../src/i18n/languages.json", import.meta.url), "utf8"),
);

/** Share the runtime registry; identity and entry point never depend on locale. */
export function generatePwaManifests(outputDirectory) {
  mkdirSync(outputDirectory, { recursive: true });
  const files = [];
  for (const [language, metadata] of Object.entries(registry)) {
    const localePath = new URL(
      `../src/i18n/locales/${language}.json`,
      import.meta.url,
    );
    // Incremental implementation can only expose catalogs that actually exist.
    if (!existsSync(localePath)) continue;
    const locale = JSON.parse(readFileSync(localePath, "utf8"));
    if (!locale.about?.description?.trim())
      throw new Error(`Missing PWA description: ${language}`);
    const manifest = {
      name: "Morpher91",
      short_name: "Morpher91",
      description: locale.about.description,
      id: "/",
      scope: "/",
      start_url: "/",
      display: "standalone",
      orientation: "any",
      lang: language,
      dir: metadata.direction,
      background_color: "#0a0b0d",
      theme_color: "#0a0b0d",
      icons: [
        {
          src: "/icon-192x192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icon-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icon-maskable-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };
    const filename =
      language === "en"
        ? "manifest.webmanifest"
        : `manifest.${language}.webmanifest`;
    writeFileSync(
      join(outputDirectory, filename),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    files.push(filename);
  }
  return files;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output =
    process.argv[2] ?? fileURLToPath(new URL("../public/", import.meta.url));
  console.log(
    `Generated ${generatePwaManifests(output).length} localized PWA manifests`,
  );
}
