import { describe, expect, it } from "vitest";
import { isSimpleRing } from "./isSimpleRing";

const v = (x: number, y: number) => ({ x, y });

describe("isSimpleRing", () => {
  it("accepts convex and concave simple rings, in either winding", () => {
    const square = [v(0, 0), v(1, 0), v(1, 1), v(0, 1)];
    expect(isSimpleRing(square)).toBe(true);
    expect(isSimpleRing([...square].reverse())).toBe(true);
    const arrow = [v(0, 0), v(2, 0), v(2, 2), v(1, 0.5), v(0, 2)];
    expect(isSimpleRing(arrow)).toBe(true);
  });

  it("treats degenerate rings (< 4 points) as simple", () => {
    expect(isSimpleRing([])).toBe(true);
    expect(isSimpleRing([v(0, 0), v(1, 0), v(0, 1)])).toBe(true);
  });

  it("rejects a bow-tie (crossing edges)", () => {
    expect(isSimpleRing([v(0, 0), v(1, 1), v(1, 0), v(0, 1)])).toBe(false);
  });

  it("rejects a ring whose contour folds back over itself", () => {
    // A quad whose last vertex sits past the first edge, so the closing edge
    // crosses it (the shape the region tool produces when handles are dragged
    // across each other).
    const folded = [v(0, 0), v(2, 0), v(2, 1), v(1, -1)];
    expect(isSimpleRing(folded)).toBe(false);
  });

  it("rejects non-adjacent edges that merely touch", () => {
    const touching = [v(0, 0), v(2, 0), v(2, 2), v(1, 0), v(0, 2)];
    expect(isSimpleRing(touching)).toBe(false);
  });
});
