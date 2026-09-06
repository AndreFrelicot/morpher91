import type { FeatureId, LayerId, NormalizedVec2 } from "./types";

export type TimedPoint = {
  timeSec: number;
  pos: NormalizedVec2;
};

export type TimedPointArray = {
  timeSec: number;
  points: NormalizedVec2[];
};

export type PointFeatureTracks = {
  a?: TimedPoint[];
  b?: TimedPoint[];
};

export type SegmentFeatureTracks = {
  a0?: TimedPoint[];
  a1?: TimedPoint[];
  b0?: TimedPoint[];
  b1?: TimedPoint[];
};

export type PolylineFeatureTracks = {
  a?: TimedPointArray[];
  b?: TimedPointArray[];
};

/** Shared fields for every feature pair. PRD §8.1 */
export type FeatureBase = {
  id: FeatureId;
  label?: string;
  enabled: boolean;
  locked?: boolean;
  layerId?: LayerId;
  weight?: number;
  createdAt: string;
  updatedAt: string;
};

export type PointFeaturePair = FeatureBase & {
  kind: "point";
  a: NormalizedVec2;
  b: NormalizedVec2;
  tracks?: PointFeatureTracks;
  semantic?:
    | "left-eye"
    | "right-eye"
    | "nose"
    | "mouth"
    | "chin"
    | "jaw"
    | "hairline"
    | "custom";
};

export type SegmentFeaturePair = FeatureBase & {
  kind: "segment";
  a0: NormalizedVec2;
  a1: NormalizedVec2;
  b0: NormalizedVec2;
  b1: NormalizedVec2;
  tracks?: SegmentFeatureTracks;
  falloff?: number;
};

export type PolylineFeaturePair = FeatureBase & {
  kind: "polyline";
  a: NormalizedVec2[];
  b: NormalizedVec2[];
  tracks?: PolylineFeatureTracks;
  closed?: boolean;
  /** Render the contour as a Catmull-Rom curve through the points (free-draw). */
  smooth?: boolean;
  /** Number of samples when converted to TPS landmarks. */
  sampleCount?: number;
  falloff?: number;
};

export type RegionFeaturePair = FeatureBase & {
  kind: "region";
  a: NormalizedVec2[];
  b: NormalizedVec2[];
  tracks?: PolylineFeatureTracks;
  /** Render the region outline as a Catmull-Rom curve through the points (free-draw). */
  smooth?: boolean;
  role?: "face" | "hair" | "neck" | "body" | "background" | "custom";
  feather: number;
};

export type FeaturePair =
  | PointFeaturePair
  | SegmentFeaturePair
  | PolylineFeaturePair
  | RegionFeaturePair;

/** Partial update applied to one feature (e.g. live drag, inspector edit). */
export type FeaturePatch =
  | Partial<PointFeaturePair>
  | Partial<SegmentFeaturePair>
  | Partial<PolylineFeaturePair>
  | Partial<RegionFeaturePair>;
