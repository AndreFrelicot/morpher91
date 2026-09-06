import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = join(dirname(fileURLToPath(import.meta.url)), "../..");
const page = new DOMParser().parseFromString(
  readFileSync(join(app, "index.html"), "utf8"),
  "text/html",
);

describe("Apple Home Screen metadata", () => {
  it("provides opaque PNG artwork matching every advertised iPad and iPhone size", () => {
    const icons = [...page.querySelectorAll('link[rel="apple-touch-icon"]')];
    expect(icons.map((icon) => icon.getAttribute("sizes")).sort()).toEqual([
      "152x152",
      "167x167",
      "180x180",
    ]);
    for (const icon of icons) {
      const png = readFileSync(join(app, "public", icon.getAttribute("href")!));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.subarray(12, 16).toString()).toBe("IHDR");
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(
        icon.getAttribute("sizes"),
      );
      expect(png[25]).toBe(2); // RGB, no alpha channel.
      expect(png.includes(Buffer.from("tRNS"))).toBe(false);
    }
    // Safari also probes this conventional path without using the link tags.
    expect(
      icons.some(
        (icon) => icon.getAttribute("href") === "/apple-touch-icon.png",
      ),
    ).toBe(true);
  });

  it("keeps the standalone status bar outside the studio", () => {
    expect(
      page
        .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
        ?.getAttribute("content"),
    ).toBe("black");
    expect(
      page.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    ).toContain("viewport-fit=cover");
  });
});
