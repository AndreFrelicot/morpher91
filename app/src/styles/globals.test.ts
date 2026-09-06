import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

describe("global viewport locking", () => {
  it("prevents native document panning", () => {
    const viewportRule = css.match(/html,\s*body,\s*#root\s*\{([^}]+)\}/)?.[1];
    const bodyRule = css.match(/\n\s*body\s*\{([^}]+)\}/)?.[1];
    const rangeRule = css.match(/input\[type="range"\]\s*\{([^}]+)\}/)?.[1];

    expect(viewportRule).toContain("overflow: hidden");
    expect(viewportRule).toContain("overscroll-behavior: none");
    expect(viewportRule).toContain("touch-action: none");
    expect(bodyRule).toContain("position: fixed");
    expect(rangeRule).toContain("touch-action: none");
  });
});
