import { readFileSync, writeFileSync } from "node:fs";

// One source of truth for the credits and the versioned offline cache.
// No git commit or tag is created by the build.
const file = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(file, "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  throw new Error(`Expected a major.minor.patch version, got ${pkg.version}`);
}
const [major, minor, patch] = pkg.version.split(".").map(Number);
if (![major, minor, patch + 1].every(Number.isSafeInteger)) {
  throw new Error("Version number is outside the safe integer range");
}
const previous = pkg.version;
pkg.version = `${major}.${minor}.${patch + 1}`;
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Morpher91 ${previous} → ${pkg.version}`);
