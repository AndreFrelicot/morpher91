import { describe, expect, it } from "vitest";
import type { MorphLine } from "./buildMorphLines";
import { type BeierCoeffs, warpToA, warpToB } from "./beierWarp";

const coeffs: BeierCoeffs = { a: 0.001, b: 2, p: 0 };

const line = (
  a0: number[],
  a1: number[],
  b0: number[],
  b1: number[],
): MorphLine => ({
  a0: { x: a0[0], y: a0[1] },
  a1: { x: a1[0], y: a1[1] },
  b0: { x: b0[0], y: b0[1] },
  b1: { x: b1[0], y: b1[1] },
  weight: 1,
  falloff: 1,
});

describe("beierWarp", () => {
  it("is the identity when there are no lines", () => {
    const x = { x: 0.4, y: 0.6 };
    expect(warpToA(x, [], 0.5, coeffs)).toEqual(x);
  });

  it("reduces to pure translation for a single translated line", () => {
    // A horizontal line, B the same line translated by (+0.3, 0). At t=1 the
    // intermediate equals B, so warp-to-A undoes the translation everywhere.
    const lines = [line([0, 0.5], [1, 0.5], [0.3, 0.5], [1.3, 0.5])];
    const src = warpToA({ x: 0.5, y: 0.5 }, lines, 1, coeffs);
    expect(src.x).toBeCloseTo(0.2, 6);
    expect(src.y).toBeCloseTo(0.5, 6);

    const off = warpToA({ x: 0.5, y: 0.9 }, lines, 1, coeffs);
    expect(off.x).toBeCloseTo(0.2, 6);
    expect(off.y).toBeCloseTo(0.9, 6);
  });

  it("warps toward B with the mirror mapping at t=0", () => {
    // At t=0 the intermediate equals A; warp-to-B maps an A-frame point into B.
    const lines = [line([0, 0.5], [1, 0.5], [0.3, 0.5], [1.3, 0.5])];
    const src = warpToB({ x: 0.5, y: 0.5 }, lines, 0, coeffs);
    expect(src.x).toBeCloseTo(0.8, 6);
    expect(src.y).toBeCloseTo(0.5, 6);
  });

  it("maps back through a 90° rotation for a single line", () => {
    // A: (0,0)->(1,0) ; B: (0,0)->(0,1) is A rotated 90° about the origin.
    const lines = [line([0, 0], [1, 0], [0, 0], [0, 1])];
    // At t=1 the intermediate is B; warp-to-A maps B's endpoint to A's endpoint.
    const src = warpToA({ x: 0, y: 1 }, lines, 1, coeffs);
    expect(src.x).toBeCloseTo(1, 6);
    expect(src.y).toBeCloseTo(0, 6);
  });

  it("stays finite for a degenerate line (a0 == a1)", () => {
    const lines = [line([0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5])];
    const src = warpToA({ x: 0.3, y: 0.7 }, lines, 0.5, coeffs);
    expect(Number.isFinite(src.x)).toBe(true);
    expect(Number.isFinite(src.y)).toBe(true);
  });
});
