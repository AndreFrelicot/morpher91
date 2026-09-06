import { describe, expect, it } from "vitest";
import type { Vec2 } from "@/morph/model";
import {
  REGION_CONTOUR_STEPS,
  renderedContour,
  renderedRegionRing,
} from "./regionContour";

const points: Vec2[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 1 },
  { x: 1, y: 0 },
];

describe("renderedContour", () => {
  it("closes a straight contour without mutating its control points", () => {
    const before = structuredClone(points);
    const contour = renderedContour(points, false, true);

    expect(contour).toEqual([...points, points[0]]);
    expect(contour[contour.length - 1]).not.toBe(points[0]);
    expect(points).toEqual(before);
  });

  it("keeps an open straight contour open", () => {
    expect(renderedContour(points, false, false)).toEqual(points);
  });

  it("samples a smooth closed contour through every control point", () => {
    const contour = renderedContour(points, true, true);

    expect(contour).toHaveLength(points.length * REGION_CONTOUR_STEPS + 1);
    expect(contour[0]).toEqual(contour[contour.length - 1]);
    for (const point of points) {
      expect(contour).toContainEqual(point);
    }
  });
});

describe("renderedRegionRing", () => {
  it("removes the duplicate closing point for triangulation", () => {
    const contour = renderedContour(points, true, true);
    const ring = renderedRegionRing(points, true);

    expect(ring).toEqual(contour.slice(0, -1));
    expect(ring[0]).not.toEqual(ring[ring.length - 1]);
  });
});
