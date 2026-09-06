import { describe, expect, it } from "vitest";
import type { Vec2 } from "@/morph/model";
import { appendStamps, initialStampPath, stampAlpha } from "./strokeStamps";

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

describe("appendStamps", () => {
  it("stamps the first point of a stroke immediately", () => {
    const { stamps } = appendStamps(initialStampPath(), [{ x: 5, y: 5 }], 10);
    expect(stamps).toEqual([{ x: 5, y: 5 }]);
  });

  it("spaces stamps uniformly along a segment", () => {
    const { stamps } = appendStamps(
      initialStampPath(),
      [
        { x: 0, y: 0 },
        { x: 35, y: 0 },
      ],
      10,
    );
    expect(stamps.map((s) => s.x)).toEqual([0, 10, 20, 30]);
    for (let i = 1; i < stamps.length; i++) {
      expect(dist(stamps[i - 1], stamps[i])).toBeCloseTo(10);
    }
  });

  it("carries the residual distance across events (uniform over the path)", () => {
    const first = appendStamps(
      initialStampPath(),
      [
        { x: 0, y: 0 },
        { x: 7, y: 0 },
      ],
      10,
    );
    expect(first.stamps).toEqual([{ x: 0, y: 0 }]); // 7 < spacing → carried
    const second = appendStamps(first.state, [{ x: 14, y: 0 }], 10);
    expect(second.stamps.map((s) => s.x)).toEqual([10]);
    expect(second.state.carry).toBeCloseTo(4);
  });

  it("keeps spacing across polyline corners", () => {
    const { stamps } = appendStamps(
      initialStampPath(),
      [
        { x: 0, y: 0 },
        { x: 15, y: 0 },
        { x: 15, y: 15 },
      ],
      10,
    );
    // Path length 30 → stamps at path distances 0, 10, 20, 30 (around the corner).
    expect(stamps).toHaveLength(4);
    expect(stamps[1]).toEqual({ x: 10, y: 0 });
    expect(stamps[2]).toEqual({ x: 15, y: 5 });
    expect(stamps[3]).toEqual({ x: 15, y: 15 });
  });

  it("emits nothing for zero-length movement", () => {
    const start = appendStamps(initialStampPath(), [{ x: 3, y: 3 }], 10);
    const next = appendStamps(start.state, [{ x: 3, y: 3 }], 10);
    expect(next.stamps).toEqual([]);
  });
});

describe("stampAlpha (shader falloff mirror)", () => {
  it("deposits full strength at the center and nothing past the radius", () => {
    expect(stampAlpha(0, 40, 0.5, 0.8)).toBeCloseTo(0.8);
    expect(stampAlpha(41, 40, 0.5, 0.8)).toBe(0);
  });

  it("is monotonically decreasing over the falloff band", () => {
    let prev = Infinity;
    for (let d = 0; d <= 40; d += 2) {
      const a = stampAlpha(d, 40, 0.3, 1);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it("hardness 1 gives a hard edge, hardness 0 a full-radius falloff", () => {
    expect(stampAlpha(39.9, 40, 1, 1)).toBeCloseTo(1, 1);
    expect(stampAlpha(20, 40, 0, 1)).toBeGreaterThan(0);
    expect(stampAlpha(20, 40, 0, 1)).toBeLessThan(1);
  });
});
