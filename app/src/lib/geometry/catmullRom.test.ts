import { describe, expect, it } from "vitest";
import type { Vec2 } from "@/morph/model";
import { sampleCatmullRom } from "./catmullRom";

const has = (pts: Vec2[], p: Vec2) =>
  pts.some((q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9);

describe("sampleCatmullRom", () => {
  it("passes through inputs with fewer than 3 control points", () => {
    const two: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(sampleCatmullRom(two)).toEqual(two);
  });

  it("interpolates every control point (open)", () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
      { x: 3, y: 2 },
    ];
    const curve = sampleCatmullRom(pts, 8);
    for (const p of pts) expect(has(curve, p)).toBe(true);
    // (spans = n-1 = 3) * steps + final endpoint.
    expect(curve.length).toBe(3 * 8 + 1);
  });

  it("keeps a straight line straight (no overshoot)", () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const curve = sampleCatmullRom(pts, 6);
    for (const p of curve) expect(p.y).toBeCloseTo(0, 9);
    expect(curve[0]).toEqual({ x: 0, y: 0 });
    expect(curve[curve.length - 1]).toEqual({ x: 3, y: 0 });
  });

  it("bows away from the chord at a corner (actual smoothing)", () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    const curve = sampleCatmullRom(pts, 16);
    // The rising span is the chord y = x; a smoothed curve bows above it instead
    // of tracking the straight segments (piecewise-linear would have y === x).
    expect(curve.some((p) => p.x < 0.5 && p.y > p.x + 0.05)).toBe(true);
  });

  it("returns to the start when closed", () => {
    const pts: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const curve = sampleCatmullRom(pts, 8, true);
    expect(curve.length).toBe(4 * 8 + 1);
    expect(curve[0]).toEqual(curve[curve.length - 1]);
  });
});
