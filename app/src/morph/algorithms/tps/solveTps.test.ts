import { describe, expect, it } from "vitest";
import { evalTps, solveTps } from "./solveTps";

/** Interleave (x, y) pairs into the Float32Array layout solveTps expects. */
const pack = (pts: [number, number][]) =>
  Float32Array.from(pts.flatMap(([x, y]) => [x, y]));

describe("solveTps", () => {
  it("respects the landmarks exactly at lambda = 0", () => {
    const src = pack([
      [0.1, 0.1],
      [0.9, 0.2],
      [0.5, 0.8],
      [0.3, 0.5],
    ]);
    const dst = pack([
      [0.2, 0.15],
      [0.85, 0.3],
      [0.45, 0.7],
      [0.35, 0.55],
    ]);
    const c = solveTps(src, dst, 0);
    for (let i = 0; i < src.length / 2; i++) {
      const out = evalTps(c, src[i * 2], src[i * 2 + 1]);
      expect(out.x).toBeCloseTo(dst[i * 2], 4);
      expect(out.y).toBeCloseTo(dst[i * 2 + 1], 4);
    }
  });

  it("is the identity warp when src == dst (warp identity for A == B)", () => {
    const src = pack([
      [0.1, 0.1],
      [0.9, 0.2],
      [0.5, 0.8],
      [0.3, 0.5],
    ]);
    const c = solveTps(src, src, 0.001);
    // Affine part is the identity; bending weights vanish.
    expect(c.affineX[0]).toBeCloseTo(0, 5);
    expect(c.affineX[1]).toBeCloseTo(1, 5);
    expect(c.affineX[2]).toBeCloseTo(0, 5);
    expect(c.affineY[0]).toBeCloseTo(0, 5);
    expect(c.affineY[1]).toBeCloseTo(0, 5);
    expect(c.affineY[2]).toBeCloseTo(1, 5);
    for (let i = 0; i < c.weightsX.length; i++) {
      expect(c.weightsX[i]).toBeCloseTo(0, 5);
      expect(c.weightsY[i]).toBeCloseTo(0, 5);
    }
    // Arbitrary point maps to itself.
    const out = evalTps(c, 0.42, 0.63);
    expect(out.x).toBeCloseTo(0.42, 5);
    expect(out.y).toBeCloseTo(0.63, 5);
  });

  it("reproduces an affine map (pure translation) everywhere", () => {
    const src = pack([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    const dst = pack([
      [0.1, 0.2],
      [1.1, 0.2],
      [0.1, 1.2],
      [1.1, 1.2],
    ]);
    const c = solveTps(src, dst, 0);
    const out = evalTps(c, 0.5, 0.5);
    expect(out.x).toBeCloseTo(0.6, 4);
    expect(out.y).toBeCloseTo(0.7, 4);
  });
});
