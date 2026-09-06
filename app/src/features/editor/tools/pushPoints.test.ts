import { describe, expect, it } from "vitest";
import type { Vec2 } from "@/morph/model";
import { falloffWeight, pushPoints } from "./pushPoints";

describe("falloffWeight", () => {
  it("is 1 at the centre and 0 at/after the radius", () => {
    expect(falloffWeight(0, 10)).toBe(1);
    expect(falloffWeight(10, 10)).toBe(0);
    expect(falloffWeight(20, 10)).toBe(0);
  });

  it("decreases monotonically with distance", () => {
    const a = falloffWeight(2, 10);
    const b = falloffWeight(5, 10);
    const c = falloffWeight(8, 10);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
  });

  it("degenerates safely for a zero radius", () => {
    expect(falloffWeight(0, 0)).toBe(1);
    expect(falloffWeight(1, 0)).toBe(0);
  });
});

describe("pushPoints", () => {
  const delta = { x: 4, y: 0 };
  const pts: Vec2[] = [
    { x: 0, y: 0 }, // centre → full delta
    { x: 10, y: 0 }, // at radius → untouched
    { x: 100, y: 0 }, // outside → untouched
  ];

  it("moves the centre point by the full delta", () => {
    const out = pushPoints(pts, { x: 0, y: 0 }, delta, 10);
    expect(out[0]).toEqual({ x: 4, y: 0 });
  });

  it("leaves points at or beyond the radius unchanged", () => {
    const out = pushPoints(pts, { x: 0, y: 0 }, delta, 10);
    expect(out[1]).toEqual({ x: 10, y: 0 });
    expect(out[2]).toEqual({ x: 100, y: 0 });
  });

  it("partially moves a point inside the falloff", () => {
    const out = pushPoints([{ x: 5, y: 0 }], { x: 0, y: 0 }, delta, 10);
    expect(out[0].x).toBeGreaterThan(5);
    expect(out[0].x).toBeLessThan(9);
  });

  it("does not mutate the input array or points", () => {
    const input: Vec2[] = [{ x: 0, y: 0 }];
    const out = pushPoints(input, { x: 0, y: 0 }, delta, 10);
    expect(input[0]).toEqual({ x: 0, y: 0 });
    expect(out[0]).not.toBe(input[0]);
  });
});
