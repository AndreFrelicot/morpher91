import { describe, it, expect } from "vitest";
import { computeUvTransform } from "./imagePlacement";

describe("computeUvTransform", () => {
  it("is identity for matching aspect ratios", () => {
    expect(computeUvTransform(100, 100, 50, 50, "contain")).toEqual({
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("letterboxes a wide image vertically (contain)", () => {
    const t = computeUvTransform(100, 100, 200, 100, "contain");
    expect(t.scaleX).toBe(1);
    expect(t.scaleY).toBeCloseTo(2);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBeCloseTo(-0.5);
  });

  it("crops a wide image horizontally (cover)", () => {
    const t = computeUvTransform(100, 100, 200, 100, "cover");
    expect(t.scaleX).toBeCloseTo(0.5);
    expect(t.offsetX).toBeCloseTo(0.25);
    expect(t.scaleY).toBe(1);
    expect(t.offsetY).toBe(0);
  });
});
