import type {
  PointFeaturePair,
  PolylineFeaturePair,
  RegionFeaturePair,
  SegmentFeaturePair,
} from "./features";
import type { NormalizedVec2 } from "./types";

const base = () => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
};

/** Creates a point feature with both sides at `a` unless `b` is given. */
export function createPointFeature(
  a: NormalizedVec2,
  b: NormalizedVec2 = a,
): PointFeaturePair {
  return { ...base(), kind: "point", a: { ...a }, b: { ...b } };
}

/** Creates a segment; the target side mirrors the source unless given. */
export function createSegmentFeature(
  a0: NormalizedVec2,
  a1: NormalizedVec2,
  b0: NormalizedVec2 = a0,
  b1: NormalizedVec2 = a1,
): SegmentFeaturePair {
  return {
    ...base(),
    kind: "segment",
    a0: { ...a0 },
    a1: { ...a1 },
    b0: { ...b0 },
    b1: { ...b1 },
  };
}

/** Creates a polyline; the target side mirrors the source unless given. */
export function createPolylineFeature(
  a: NormalizedVec2[],
  b: NormalizedVec2[] = a,
): PolylineFeaturePair {
  return {
    ...base(),
    kind: "polyline",
    a: a.map((p) => ({ ...p })),
    b: b.map((p) => ({ ...p })),
  };
}

/** Creates a polygonal region mask; the target side mirrors source by default. */
export function createRegionFeature(
  a: NormalizedVec2[],
  b: NormalizedVec2[] = a,
  feather = 0.04,
): RegionFeaturePair {
  return {
    ...base(),
    kind: "region",
    a: a.map((p) => ({ ...p })),
    b: b.map((p) => ({ ...p })),
    feather,
  };
}
