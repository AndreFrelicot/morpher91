// Authoring utility (macOS sips). Generated icons/manifests are checked in;
// production builds do not depend on an image tool or modify the artwork.
import { execFileSync } from "node:child_process";
import { generatePwaManifests } from "./generate-pwa-manifests.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const original = fileURLToPath(
  new URL("../src/assets/morpher91-logo.png", import.meta.url),
);
const output = (file) =>
  fileURLToPath(new URL(`../public/${file}`, import.meta.url));
for (const [size, file] of [
  [16, "favicon-16x16.png"],
  [32, "favicon-32x32.png"],
  [48, "favicon-48x48.png"],
  [152, "apple-touch-icon-152x152.png"],
  [167, "apple-touch-icon-167x167.png"],
  [180, "apple-touch-icon.png"],
  [192, "icon-192x192.png"],
  [512, "icon-512x512.png"],
  [288, "icon-maskable-512x512.png"],
]) {
  execFileSync("sips", [
    "-z",
    String(size),
    String(size),
    original,
    "--out",
    output(file),
  ]);
}
// Fit the full square artwork inside the maskable icon's central safe circle.
execFileSync("sips", [
  "--padToHeightWidth",
  "512",
  "512",
  "--padColor",
  "080b10",
  output("icon-maskable-512x512.png"),
]);

// ICO directory containing lossless PNG entries at the three favicon sizes.
const sizes = [16, 32, 48];
const images = sizes.map((size) =>
  readFileSync(output(`favicon-${size}x${size}.png`)),
);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(output("favicon.ico"), Buffer.concat([header, ...images]));

const manifests = generatePwaManifests(
  fileURLToPath(new URL("../public/", import.meta.url)),
);
console.log(
  `Generated Morpher91 icons and ${manifests.length} localized manifests`,
);
