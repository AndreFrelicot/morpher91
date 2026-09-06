import { generatePwaManifests } from "./generate-pwa-manifests.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

const manifests = new Set(generatePwaManifests(dist));
const fonts = Object.values(
  JSON.parse(
    readFileSync(new URL("../src/i18n/fonts.json", import.meta.url), "utf8"),
  ),
);
const sharedFonts = JSON.parse(
  readFileSync(
    new URL("../src/i18n/shared-fonts.json", import.meta.url),
    "utf8",
  ),
);
const { fontCache } = JSON.parse(
  readFileSync(new URL("../src/pwa/cachePolicy.json", import.meta.url), "utf8"),
);
const onDemandFonts = fonts.map((font) => font.full.url);

// Include lazy catalogues, native-name fonts and branding in the offline shell.
// Full script fonts stay in the persistent, content-addressed on-demand cache.
// Demo media and user files are deliberately outside the application cache.
const shell = [
  ...new Set([
    // Cache HTML only at its canonical URL; /index.html redirects on Cloudflare.
    "/",
    ...fonts.flatMap((font) => [font.native.url, font.license]),
    ...sharedFonts.flatMap((font) => [font.url, font.license]),
    ...filesIn(dist)
      .filter((file) => {
        const path = relative(dist, file).split(sep).join("/");
        return (
          path.startsWith("assets/") ||
          path.startsWith("licenses/") ||
          path === "THIRD_PARTY_NOTICES.txt" ||
          manifests.has(path) ||
          /^(favicon.*|apple-touch-icon(?:-\d+x\d+)?\.png|icon-.*\.png)$/.test(
            path,
          )
        );
      })
      .map((file) => `/${relative(dist, file).split(sep).join("/")}`),
  ]),
];
const source = readFileSync(
  new URL("../src/pwa/service-worker.js", import.meta.url),
  "utf8",
);
writeFileSync(
  join(dist, "sw.js"),
  source
    .replace('"__MORPHER_CACHE__"', JSON.stringify(`morpher91-${version}`))
    .replace('"__MORPHER_FONT_CACHE__"', JSON.stringify(fontCache))
    .replace('"__MORPHER_FONTS__"', JSON.stringify(onDemandFonts))
    .replace('"__MORPHER_SHELL__"', JSON.stringify(shell)),
);
console.log(`PWA v${version}: ${shell.length} application files cached`);
console.log(
  `Fonts: ${fonts.reduce((total, font) => total + font.native.bytes, 0)} native-name bytes in shell; ${fonts.reduce((total, font) => total + font.full.bytes, 0)} full-font bytes cached on demand`,
);
