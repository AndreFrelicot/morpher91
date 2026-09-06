import { describe, expect, it } from "vitest";
import type { Vec2 } from "@/morph/model";
import { triangulatePolygon } from "./triangulatePolygon";

/** Sum of triangle areas for the produced triangulation. */
function triangulatedArea(points: Vec2[], tris: number[]): number {
  let a = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const p = points[tris[i]];
    const q = points[tris[i + 1]];
    const r = points[tris[i + 2]];
    a += Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2;
  }
  return a;
}

describe("triangulatePolygon", () => {
  it("returns no triangles for degenerate input", () => {
    expect(triangulatePolygon([])).toEqual([]);
    expect(triangulatePolygon([{ x: 0, y: 0 }])).toEqual([]);
    expect(
      triangulatePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([]);
  });

  it("triangulates a convex quad into 2 triangles covering its area", () => {
    const square: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const tris = triangulatePolygon(square);
    expect(tris.length).toBe(6); // (4 - 2) triangles
    expect(triangulatedArea(square, tris)).toBeCloseTo(1, 6);
  });

  it("triangulates a concave polygon covering its true area", () => {
    // Arrow / chevron (concave at the notch).
    const arrow: Vec2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 4 },
      { x: 1, y: 2 },
    ];
    const tris = triangulatePolygon(arrow);
    expect(tris.length).toBe(6); // (4 - 2) triangles
    // Shoelace area of the concave ring.
    const expected =
      Math.abs(
        0 * 2 - 4 * 0 + (4 * 4 - 0 * 2) + (0 * 2 - 1 * 4) + (1 * 0 - 0 * 2),
      ) / 2;
    expect(triangulatedArea(arrow, tris)).toBeCloseTo(expected, 6);
  });

  it("is winding-independent (CW input still covers the area)", () => {
    const cw: Vec2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    const tris = triangulatePolygon(cw);
    expect(tris.length).toBe(6);
    expect(triangulatedArea(cw, tris)).toBeCloseTo(1, 6);
  });

  it("emits indices into the original point array", () => {
    const tri: Vec2[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 2 },
    ];
    const tris = triangulatePolygon(tri);
    expect(tris.length).toBe(3);
    expect([...tris].sort()).toEqual([0, 1, 2]);
  });
});
