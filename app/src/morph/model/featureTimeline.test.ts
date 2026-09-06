import { describe, expect, it } from "vitest";
import {
  patchFeatureHandleTrack,
  projectAtFeatureTimes,
  sampleFeatureAtTimes,
  samplePointTrack,
} from "./featureTimeline";
import {
  createPointFeature,
  createRegionFeature,
  createSegmentFeature,
} from "./featureFactory";
import type { RegionFeaturePair } from "./features";
import { createProject } from "./project";
import { defaultPlacement } from "./image";

describe("feature timeline tracks", () => {
  it("preserves project and feature identity when no track is active", () => {
    const project = createProject(
      {
        id: "a",
        name: "a",
        width: 1,
        height: 1,
        source: { kind: "bundled", value: "a" },
        placement: defaultPlacement(),
      },
      {
        id: "b",
        name: "b",
        width: 1,
        height: 1,
        source: { kind: "bundled", value: "b" },
        placement: defaultPlacement(),
      },
    );
    project.features = [createPointFeature({ x: 0.2, y: 0.3 })];

    const sampled = projectAtFeatureTimes(project, 1, 2);

    expect(sampled).toBe(project);
    expect(sampled.features).toBe(project.features);
    expect(sampled.features[0]).toBe(project.features[0]);
  });

  it("rebuilds only tracked features and changed sides", () => {
    const tracked = createPointFeature({ x: 0, y: 0 }, { x: 1, y: 1 });
    tracked.tracks = { a: [{ timeSec: 1, pos: { x: 0.5, y: 0.5 } }] };
    const staticFeature = createPointFeature({ x: 0.2, y: 0.3 });
    const project = createProject(
      {
        id: "a",
        name: "a",
        width: 1,
        height: 1,
        source: { kind: "bundled", value: "a" },
        placement: defaultPlacement(),
      },
      {
        id: "b",
        name: "b",
        width: 1,
        height: 1,
        source: { kind: "bundled", value: "b" },
        placement: defaultPlacement(),
      },
    );
    project.features = [tracked, staticFeature];

    const sampled = projectAtFeatureTimes(project, 1, 2);

    expect(sampled).not.toBe(project);
    expect(sampled.features).not.toBe(project.features);
    expect(sampled.features[0]).not.toBe(tracked);
    expect(sampled.features[0]).toMatchObject({ kind: "point" });
    if (sampled.features[0].kind !== "point") throw new Error("expected point");
    expect(sampled.features[0].b).toBe(tracked.b);
    expect(sampled.features[1]).toBe(staticFeature);
  });
  it("returns the same sampled identity for consecutive frames at one time", () => {
    const tracked = createPointFeature({ x: 0, y: 0 }, { x: 1, y: 1 });
    tracked.tracks = {
      a: [
        { timeSec: 0, pos: { x: 0, y: 0 } },
        { timeSec: 2, pos: { x: 1, y: 1 } },
      ],
    };
    const project = createProject(
      {
        id: "a",
        name: "a",
        width: 1,
        height: 1,
        source: { kind: "bundled", value: "a" },
        placement: defaultPlacement(),
      },
      {
        id: "b",
        name: "b",
        width: 1,
        height: 1,
        source: { kind: "bundled", value: "b" },
        placement: defaultPlacement(),
      },
    );
    project.features = [tracked];

    const first = projectAtFeatureTimes(project, 1, 2);
    const second = projectAtFeatureTimes(project, 1, 2);
    expect(second).toBe(first);
    expect(second.features).toBe(first.features);

    // Sub-quantum jitter (< 1/240 s) maps to the same sampled identity.
    const jittered = projectAtFeatureTimes(project, 1 + 1 / 1000, 2);
    expect(jittered).toBe(first);

    // A genuinely different time produces a new identity…
    const later = projectAtFeatureTimes(project, 1.5, 2);
    expect(later).not.toBe(first);
    // …and revisiting a cached time still hits (LRU keeps recent frames).
    expect(projectAtFeatureTimes(project, 1, 2)).toBe(first);

    // Editing the project invalidates the memo for the new identity.
    const edited = { ...project };
    expect(projectAtFeatureTimes(edited, 1, 2)).not.toBe(first);
  });

  it("samples point tracks linearly between local video keyframes", () => {
    const pos = samplePointTrack(
      [
        { timeSec: 0, pos: { x: 0, y: 0 } },
        { timeSec: 2, pos: { x: 1, y: 0.5 } },
      ],
      { x: 0.4, y: 0.4 },
      1,
    );
    expect(pos).toEqual({ x: 0.5, y: 0.25 });
  });

  it("samples A and B sides with independent local times", () => {
    const feature = createPointFeature({ x: 0, y: 0 }, { x: 1, y: 1 });
    feature.tracks = {
      a: [
        { timeSec: 0, pos: { x: 0, y: 0 } },
        { timeSec: 1, pos: { x: 1, y: 0 } },
      ],
      b: [
        { timeSec: 10, pos: { x: 0, y: 1 } },
        { timeSec: 12, pos: { x: 1, y: 1 } },
      ],
    };

    const sampled = sampleFeatureAtTimes(feature, 0.5, 11);
    expect(sampled).toMatchObject({
      a: { x: 0.5, y: 0 },
      b: { x: 0.5, y: 1 },
    });
  });

  it("upserts a dragged segment handle into the matching side track", () => {
    const feature = createSegmentFeature(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    );
    const patch = patchFeatureHandleTrack(
      feature,
      "b",
      "1",
      { x: 0.8, y: 0.9 },
      3,
      { b1: { x: 0.8, y: 0.9 } },
    );

    expect(patch).toMatchObject({
      b1: { x: 0.8, y: 0.9 },
      tracks: {
        b1: [{ timeSec: 3, pos: { x: 0.8, y: 0.9 } }],
      },
    });
  });

  const triangle = () =>
    createRegionFeature([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ]);

  it("seeds a region keyframe from the shape sampled at that time (propagation, M11 lot 4a)", () => {
    const region = triangle();
    // Keyframe at t=1 with the whole contour shifted right by 0.1.
    region.tracks = {
      a: [
        {
          timeSec: 1,
          points: [
            { x: 0.1, y: 0 },
            { x: 1, y: 0 },
            { x: 0.6, y: 1 },
          ],
        },
      ],
    };

    // Adjust ONE point at a later time: the other points must carry the t=1
    // keyframe shape forward, not snap back to the base contour.
    const patch = patchFeatureHandleTrack(
      region,
      "a",
      "2",
      { x: 0.7, y: 0.9 },
      3,
      {},
    ) as Partial<RegionFeaturePair>;

    const kf3 = patch.tracks?.a?.find((k) => k.timeSec === 3);
    expect(kf3?.points).toEqual([
      { x: 0.1, y: 0 }, // propagated from t=1, not base x=0
      { x: 1, y: 0 },
      { x: 0.7, y: 0.9 }, // the adjusted point
    ]);
  });

  it("accumulates multi-point edits into the same-time region keyframe (Push gesture)", () => {
    const region = triangle();
    const first = patchFeatureHandleTrack(
      region,
      "a",
      "0",
      { x: 0.05, y: 0.05 },
      2,
      {},
    ) as Partial<RegionFeaturePair>;
    const working = { ...region, ...first } as RegionFeaturePair;
    const second = patchFeatureHandleTrack(
      working,
      "a",
      "1",
      { x: 0.95, y: 0.05 },
      2,
      {},
    ) as Partial<RegionFeaturePair>;

    expect(second.tracks?.a).toHaveLength(1);
    expect(second.tracks?.a?.[0].points).toEqual([
      { x: 0.05, y: 0.05 }, // first edit kept
      { x: 0.95, y: 0.05 }, // second edit applied
      { x: 0.5, y: 1 },
    ]);
  });
});
