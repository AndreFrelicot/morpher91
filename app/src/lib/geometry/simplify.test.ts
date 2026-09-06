import { describe, expect, it } from "vitest";
import type { Vec2 } from "@/morph/model";
import { isClosedStroke, simplifyRdp } from "./simplify";

describe("simplifyRdp", () => {
  it("passes through 0/1/2-point inputs unchanged (copied)", () => {
    const two: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const out = simplifyRdp(two, 0.1);
    expect(out).toEqual(two);
    expect(out[0]).not.toBe(two[0]); // fresh copies, not aliases
  });

  it("collapses near-collinear points to the two endpoints", () => {
    const line: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0.001 },
      { x: 2, y: -0.001 },
      { x: 3, y: 0 },
    ];
    expect(simplifyRdp(line, 0.1)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("keeps a vertex that deviates beyond epsilon (corner preserved)", () => {
    const corner: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }, // 0.707 off the chord → kept
      { x: 2, y: 0 },
    ];
    expect(simplifyRdp(corner, 0.5)).toEqual(corner);
    // A larger tolerance flattens the same corner.
    expect(simplifyRdp(corner, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it("epsilon is monotonic: a larger tolerance never keeps more points", () => {
    const stroke: Vec2[] = Array.from({ length: 50 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 4) * 3,
    }));
    const tight = simplifyRdp(stroke, 0.2).length;
    const loose = simplifyRdp(stroke, 2).length;
    expect(loose).toBeLessThanOrEqual(tight);
    expect(loose).toBeGreaterThanOrEqual(2);
  });
});

describe("isClosedStroke", () => {
  it("is false for fewer than 3 samples", () => {
    expect(isClosedStroke([], 1)).toBe(false);
    expect(
      isClosedStroke(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        1,
      ),
    ).toBe(false);
  });

  it("detects a loop when the ends meet within tolerance", () => {
    const loop: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0.02, y: 0.02 },
    ];
    expect(isClosedStroke(loop, 0.1)).toBe(true);
    expect(isClosedStroke(loop, 0.01)).toBe(false);
  });

  it("is false for an open stroke", () => {
    const open: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(isClosedStroke(open, 0.1)).toBe(false);
  });
});
