export type Vec2 = { x: number; y: number };

/** A point expressed in normalized Project Space (x, y in [0, 1]). PRD §7.1 */
export type NormalizedVec2 = Vec2;

export type ProjectId = string;
export type ImageId = string;
export type VideoId = string;
export type FeatureId = string;
export type LayerId = string;

export type MorphAlgorithmId =
  | "crossfade"
  | "mesh"
  | "thin-plate-spline"
  | "beier-neely";
