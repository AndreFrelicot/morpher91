import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const groups = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: app,
    encoding: "utf8",
  }),
);
const sources = JSON.parse(
  readFileSync(new URL("./licenses/sources.json", import.meta.url), "utf8"),
);
const notices = [
  "Morpher91 — third-party software notices",
  "",
  "The original Morpher91 code is MIT licensed. Dependencies retain the licenses below.",
  "Mediabunny 1.45.4 is used without source modifications under MPL-2.0.",
  "Its source is included in the published npm package:",
  "https://registry.npmjs.org/mediabunny/-/mediabunny-1.45.4.tgz",
  "Project: https://github.com/Vanilagy/mediabunny",
  "Mozilla MPL FAQ: https://www.mozilla.org/en-US/MPL/2.0/FAQ/",
  "",
];
for (const pkg of Object.values(groups)
  .flat()
  .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
  for (const directory of pkg.paths) {
    const metadata = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    notices.push(
      "=".repeat(72),
      `${pkg.name} ${metadata.version} (${pkg.license})`,
    );
    const files = readdirSync(directory).filter((name) =>
      /^(licen[cs]e|copying|notice|unlicense)(\.|$)/i.test(name),
    );
    if (files.length) {
      for (const name of files.sort())
        notices.push(readFileSync(join(directory, name), "utf8"));
    } else {
      const fallback = pkg.name.startsWith("@radix-ui/")
        ? "radix-ui"
        : pkg.name;
      if (!sources[fallback])
        throw new Error(`Missing license text for ${pkg.name}`);
      notices.push(
        `Upstream license: ${sources[fallback]}`,
        readFileSync(
          new URL(`./licenses/${fallback}.txt`, import.meta.url),
          "utf8",
        ),
      );
    }
  }
}
notices.push("=".repeat(72), "Bundled fonts — SIL Open Font License 1.1");
for (const directory of ["public/fonts", "public/licenses"]) {
  for (const name of readdirSync(join(app, directory))
    .filter((name) => name.endsWith("-OFL.txt"))
    .sort()) {
    notices.push(name, readFileSync(join(app, directory, name), "utf8"));
  }
}
writeFileSync(
  join(app, "public/THIRD_PARTY_NOTICES.txt"),
  notices.join("\n\n") + "\n",
);
console.log(
  "Updated public/THIRD_PARTY_NOTICES.txt from installed production dependencies.",
);
