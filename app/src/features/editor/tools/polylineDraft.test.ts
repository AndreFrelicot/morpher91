import { describe, expect, it } from "vitest";
import type {
  FeaturePair,
  PolylineFeaturePair,
  RegionFeaturePair,
} from "@/morph/model";
import { createPolylineFeature, createRegionFeature } from "@/morph/model";
import { draftClickAction, findResumablePolyline } from "./polylineDraft";

/** Identity-ish transform: project space already in "screen" units for the test. */
const transform = {
  content: { x: 0, y: 0, width: 1, height: 1 },
  toScreen: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
  toNormalized: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
};

describe("draftClickAction", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it("appends when below the minimum point count", () => {
    expect(draftClickAction(pts.slice(0, 2), { x: 0, y: 0 }, 3, 4)).toBe(
      "append",
    );
  });

  it("closes on the first vertex once there are enough points", () => {
    expect(draftClickAction(pts, { x: 1, y: 1 }, 3, 4)).toBe("close-first");
  });

  it("finishes (open) on the last vertex", () => {
    expect(draftClickAction(pts, { x: 11, y: 9 }, 3, 4)).toBe("close-last");
  });

  it("appends when the click is away from both endpoints", () => {
    expect(draftClickAction(pts, { x: 5, y: 5 }, 3, 4)).toBe("append");
  });

  it("prefers the first vertex when both endpoints are within range", () => {
    const tiny = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(draftClickAction(tiny, { x: 1, y: 0 }, 3, 4)).toBe("close-first");
  });
});

describe("findResumablePolyline", () => {
  const open: PolylineFeaturePair = createPolylineFeature([
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 },
  ]);

  it("matches the last endpoint", () => {
    expect(
      findResumablePolyline([open], "a", transform, { x: 21, y: 1 }, 4),
    ).toEqual({ id: open.id, end: "last" });
  });

  it("matches the first endpoint", () => {
    expect(
      findResumablePolyline([open], "a", transform, { x: 1, y: 1 }, 4),
    ).toEqual({ id: open.id, end: "first" });
  });

  it("ignores clicks on mid-vertices", () => {
    expect(
      findResumablePolyline([open], "a", transform, { x: 10, y: 10 }, 4),
    ).toBeNull();
  });

  it("ignores closed polylines and regions", () => {
    const closed: PolylineFeaturePair = { ...open, closed: true };
    const region: RegionFeaturePair = createRegionFeature([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    const features: FeaturePair[] = [closed, region];
    expect(
      findResumablePolyline(features, "a", transform, { x: 0, y: 0 }, 4),
    ).toBeNull();
  });

  it("ignores locked or disabled polylines", () => {
    const locked: PolylineFeaturePair = { ...open, locked: true };
    const disabled: PolylineFeaturePair = { ...open, enabled: false };
    expect(
      findResumablePolyline([locked], "a", transform, { x: 0, y: 0 }, 4),
    ).toBeNull();
    expect(
      findResumablePolyline([disabled], "a", transform, { x: 0, y: 0 }, 4),
    ).toBeNull();
  });
});
