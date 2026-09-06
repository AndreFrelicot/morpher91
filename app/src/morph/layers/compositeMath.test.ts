import { describe, expect, it } from "vitest";
import { compositePremultiplied } from "./compositeMath";

function expectRgbaClose(
  actual: readonly number[],
  expected: readonly number[],
): void {
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value);
  });
}

describe("premultiplied layer compositing", () => {
  it("performs source-over without forcing opaque alpha", () => {
    expect(
      compositePremultiplied([0, 0, 0, 0], [0.4, 0.2, 0.1, 0.5], 0.5, "normal"),
    ).toEqual([0.2, 0.1, 0.05, 0.25]);
  });

  it("preserves the previous opaque normal blend", () => {
    expectRgbaClose(
      compositePremultiplied(
        [0.2, 0.4, 0.6, 1],
        [0.8, 0.2, 0.1, 1],
        0.25,
        "normal",
      ),
      [0.35, 0.35, 0.475, 1],
    );
  });

  it("evaluates multiply and screen on unpremultiplied colors", () => {
    expectRgbaClose(
      compositePremultiplied(
        [0.2, 0.4, 0.6, 1],
        [0.8, 0.2, 0.1, 1],
        1,
        "multiply",
      ),
      [0.16, 0.08, 0.06, 1],
    );
    expectRgbaClose(
      compositePremultiplied(
        [0.2, 0.4, 0.6, 1],
        [0.8, 0.2, 0.1, 1],
        1,
        "screen",
      ),
      [0.84, 0.52, 0.64, 1],
    );
  });

  it("adds premultiplied components for plus-lighter", () => {
    expect(
      compositePremultiplied(
        [0.6, 0.2, 0.1, 0.7],
        [0.5, 0.4, 0.3, 0.6],
        1,
        "lighter",
      ),
    ).toEqual([1, 0.6000000000000001, 0.4, 1]);
  });
});
