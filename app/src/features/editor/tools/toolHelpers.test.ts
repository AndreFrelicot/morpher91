import { describe, expect, it } from "vitest";
import {
  createPointFeature,
  createPolylineFeature,
  type PointFeaturePair,
  type PolylineFeaturePair,
} from "@/morph/model";
import { applyDragPatch } from "./toolHelpers";

const still = { mirror: false, hasTemporalMedia: false, sideTimeSec: 2 };
const video = { mirror: false, hasTemporalMedia: true, sideTimeSec: 2 };

describe("applyDragPatch keyframe activation (M25 follow-up)", () => {
  it("moves the base position on a still image with no keyframes", () => {
    const point = createPointFeature({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });
    const patch = applyDragPatch(point, "a", "p", { x: 0.3, y: 0.3 }, still);
    expect(patch).toEqual({ a: { x: 0.3, y: 0.3 } });
  });

  it("writes a keyframe on a still image once the side is animated", () => {
    const point = createPointFeature({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });
    point.tracks = { a: [{ timeSec: 0, pos: point.a }] };
    const patch = applyDragPatch(point, "a", "p", { x: 0.3, y: 0.3 }, still);
    const moved = { ...point, ...patch } as PointFeaturePair;
    expect(moved.a).toEqual({ x: 0.2, y: 0.2 });
    expect(moved.tracks?.a?.map((k) => k.timeSec)).toEqual([0, 2]);
    expect(moved.tracks?.a?.[1].pos).toEqual({ x: 0.3, y: 0.3 });
  });

  it("keeps the other side static until it gets its own first keyframe", () => {
    const poly = createPolylineFeature([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
    ]);
    poly.tracks = { a: [{ timeSec: 0, points: poly.a }] };
    const patch = applyDragPatch(poly, "b", "1", { x: 0.6, y: 0.2 }, still);
    const moved = { ...poly, ...patch } as PolylineFeaturePair;
    expect(moved.b[1]).toEqual({ x: 0.6, y: 0.2 });
    expect(moved.tracks?.b).toBeUndefined();
  });

  it("always keys on temporal media", () => {
    const point = createPointFeature({ x: 0.2, y: 0.2 });
    const patch = applyDragPatch(point, "a", "p", { x: 0.3, y: 0.3 }, video);
    const moved = { ...point, ...patch } as PointFeaturePair;
    expect(moved.tracks?.a?.[0]).toEqual({
      timeSec: 2,
      pos: { x: 0.3, y: 0.3 },
    });
  });
});
