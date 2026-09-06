import { describe, expect, it } from "vitest";
import {
  featureKeyframeTimes,
  hasFeatureKeyframeAt,
  moveFeatureKeyframe,
  removeFeatureKeyframe,
  setFeatureKeyframe,
} from "./featureKeyframes";
import {
  createPointFeature,
  createRegionFeature,
  createSegmentFeature,
} from "./featureFactory";
import type { RegionFeaturePair, SegmentFeaturePair } from "./features";

const triangle = () =>
  createRegionFeature([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 1 },
  ]);

describe("feature keyframe helpers (M11 lot 4a)", () => {
  it("lists a side's keyframe times sorted, and per side independently", () => {
    const region = triangle();
    region.tracks = {
      a: [
        { timeSec: 3, points: region.a },
        { timeSec: 1, points: region.a },
      ],
      b: [{ timeSec: 2, points: region.b }],
    };
    expect(featureKeyframeTimes(region, "a")).toEqual([1, 3]);
    expect(featureKeyframeTimes(region, "b")).toEqual([2]);
    expect(hasFeatureKeyframeAt(region, "a", 1.001)).toBe(true);
    expect(hasFeatureKeyframeAt(region, "a", 2)).toBe(false);
  });

  it("poses a region keyframe capturing the shape sampled at that time", () => {
    const region = triangle();
    region.tracks = {
      a: [
        {
          timeSec: 0,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0.5, y: 1 },
          ],
        },
        {
          timeSec: 2,
          points: [
            { x: 0.2, y: 0 },
            { x: 1, y: 0 },
            { x: 0.5, y: 1 },
          ],
        },
      ],
    };

    const patch = setFeatureKeyframe(
      region,
      "a",
      1,
    ) as Partial<RegionFeaturePair>;
    const kf = patch.tracks?.a?.find((k) => k.timeSec === 1);
    expect(kf?.points?.[0].x).toBeCloseTo(0.1); // midway between 0 and 0.2
    expect(patch.tracks?.a).toHaveLength(3);
  });

  it("poses both handles of a segment side at once", () => {
    const segment = createSegmentFeature(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    );
    const patch = setFeatureKeyframe(
      segment,
      "b",
      5,
    ) as Partial<SegmentFeaturePair>;
    expect(patch.tracks?.b0).toHaveLength(1);
    expect(patch.tracks?.b1).toHaveLength(1);
    expect(patch.tracks?.a0).toBeUndefined();
    expect(
      featureKeyframeTimes({ ...segment, ...patch } as SegmentFeaturePair, "b"),
    ).toEqual([5]);
  });

  it("removes only the keyframe at the given time, null when none", () => {
    const region = triangle();
    region.tracks = {
      a: [
        { timeSec: 1, points: region.a },
        { timeSec: 3, points: region.a },
      ],
    };
    const patch = removeFeatureKeyframe(
      region,
      "a",
      3,
    ) as Partial<RegionFeaturePair>;
    expect(patch?.tracks?.a?.map((k) => k.timeSec)).toEqual([1]);
    expect(removeFeatureKeyframe(region, "a", 7)).toBeNull();
  });
});

describe("moveFeatureKeyframe (M25)", () => {
  it("retimes a point keyframe, keeps its position and the sorted order", () => {
    const point = createPointFeature({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });
    point.tracks = {
      a: [
        { timeSec: 1, pos: { x: 0.2, y: 0.2 } },
        { timeSec: 3, pos: { x: 0.3, y: 0.3 } },
      ],
    };
    const patch = moveFeatureKeyframe(point, "a", 1, 4);
    expect(patch).not.toBeNull();
    const moved = { ...point, ...patch } as typeof point;
    expect(featureKeyframeTimes(moved, "a")).toEqual([3, 4]);
    expect(moved.tracks?.a?.[1]).toEqual({
      timeSec: 4,
      pos: { x: 0.2, y: 0.2 },
    });
  });

  it("retimes both endpoints of a segment side together", () => {
    const segment = createSegmentFeature(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    );
    segment.tracks = {
      b0: [{ timeSec: 2, pos: { x: 0, y: 1 } }],
      b1: [{ timeSec: 2, pos: { x: 1, y: 0 } }],
    };
    const moved = {
      ...segment,
      ...moveFeatureKeyframe(segment, "b", 2, 0.5),
    } as SegmentFeaturePair;
    expect(moved.tracks?.b0?.[0].timeSec).toBe(0.5);
    expect(moved.tracks?.b1?.[0].timeSec).toBe(0.5);
    expect(featureKeyframeTimes(moved, "b")).toEqual([0.5]);
  });

  it("retimes a region keyframe keeping its points", () => {
    const region = triangle();
    region.tracks = { a: [{ timeSec: 1, points: region.a }] };
    const moved = {
      ...region,
      ...moveFeatureKeyframe(region, "a", 1, 2),
    } as RegionFeaturePair;
    expect(moved.tracks?.a?.[0].timeSec).toBe(2);
    expect(moved.tracks?.a?.[0].points).toEqual(region.a);
  });

  it("returns null when there is no keyframe at fromSec", () => {
    const region = triangle();
    region.tracks = { a: [{ timeSec: 1, points: region.a }] };
    expect(moveFeatureKeyframe(region, "a", 2, 3)).toBeNull();
  });

  it("returns null when toSec collides with another keyframe", () => {
    const region = triangle();
    region.tracks = {
      a: [
        { timeSec: 1, points: region.a },
        { timeSec: 2, points: region.a },
      ],
    };
    expect(moveFeatureKeyframe(region, "a", 1, 2.004)).toBeNull();
    // Moving onto its own time (no-op nudge) is not a collision.
    expect(moveFeatureKeyframe(region, "a", 1, 1.001)).not.toBeNull();
  });
});
