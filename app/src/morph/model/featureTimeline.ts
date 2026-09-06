import type {
  FeaturePair,
  FeaturePatch,
  TimedPoint,
  TimedPointArray,
} from "./features";
import type { NormalizedVec2 } from "./types";
import type { MorphProject } from "./project";

type FeatureSide = "a" | "b";

const activeTrack = <T>(track: T[] | undefined): track is T[] =>
  Boolean(track && track.length > 0);

export function featureHasActiveTracks(feature: FeaturePair): boolean {
  const tracks = feature.tracks;
  return Boolean(
    tracks && Object.values(tracks).some((track) => activeTrack(track)),
  );
}

/** Two keyframes closer than this are the same keyframe (one video frame). */
export const KEYFRAME_EPSILON_SEC = 1 / 120;

function clonePoint(p: NormalizedVec2): NormalizedVec2 {
  return { x: p.x, y: p.y };
}

function lerpPoint(
  a: NormalizedVec2,
  b: NormalizedVec2,
  t: number,
): NormalizedVec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function sortedPoints(track: TimedPoint[]): TimedPoint[] {
  return [...track].sort((a, b) => a.timeSec - b.timeSec);
}

function sortedArrays(track: TimedPointArray[]): TimedPointArray[] {
  return [...track].sort((a, b) => a.timeSec - b.timeSec);
}

export function samplePointTrack(
  track: TimedPoint[] | undefined,
  fallback: NormalizedVec2,
  timeSec: number,
): NormalizedVec2 {
  if (!track || track.length === 0) return clonePoint(fallback);
  const points = sortedPoints(track);
  if (timeSec <= points[0].timeSec) return clonePoint(points[0].pos);
  const last = points[points.length - 1];
  if (timeSec >= last.timeSec) return clonePoint(last.pos);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    if (timeSec <= next.timeSec) {
      const span = Math.max(KEYFRAME_EPSILON_SEC, next.timeSec - prev.timeSec);
      return lerpPoint(prev.pos, next.pos, (timeSec - prev.timeSec) / span);
    }
  }
  return clonePoint(fallback);
}

export function samplePointArrayTrack(
  track: TimedPointArray[] | undefined,
  fallback: NormalizedVec2[],
  timeSec: number,
): NormalizedVec2[] {
  if (!track || track.length === 0) return fallback.map(clonePoint);
  const frames = sortedArrays(track);
  if (timeSec <= frames[0].timeSec) return frames[0].points.map(clonePoint);
  const last = frames[frames.length - 1];
  if (timeSec >= last.timeSec) return last.points.map(clonePoint);

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (timeSec <= next.timeSec) {
      const count = Math.min(prev.points.length, next.points.length);
      const span = Math.max(KEYFRAME_EPSILON_SEC, next.timeSec - prev.timeSec);
      const t = (timeSec - prev.timeSec) / span;
      return Array.from({ length: count }, (_, idx) =>
        lerpPoint(prev.points[idx], next.points[idx], t),
      );
    }
  }
  return fallback.map(clonePoint);
}

export function upsertPointTrack(
  track: TimedPoint[] | undefined,
  timeSec: number,
  pos: NormalizedVec2,
): TimedPoint[] {
  const next = sortedPoints(track ?? []);
  const index = next.findIndex(
    (item) => Math.abs(item.timeSec - timeSec) <= KEYFRAME_EPSILON_SEC,
  );
  const keyframe = { timeSec, pos: clonePoint(pos) };
  if (index >= 0) {
    next[index] = keyframe;
  } else {
    next.push(keyframe);
  }
  return sortedPoints(next);
}

export function upsertPointArrayTrack(
  track: TimedPointArray[] | undefined,
  timeSec: number,
  points: NormalizedVec2[],
): TimedPointArray[] {
  const withoutCurrent = (track ?? []).filter(
    (item) => Math.abs(item.timeSec - timeSec) > KEYFRAME_EPSILON_SEC,
  );
  return sortedArrays([
    ...withoutCurrent,
    { timeSec, points: points.map(clonePoint) },
  ]);
}

export function sampleFeatureAtTimes(
  feature: FeaturePair,
  sourceTimeSec: number,
  targetTimeSec: number,
): FeaturePair {
  if (!featureHasActiveTracks(feature)) return feature;
  switch (feature.kind) {
    case "point":
      return {
        ...feature,
        a: activeTrack(feature.tracks?.a)
          ? samplePointTrack(feature.tracks.a, feature.a, sourceTimeSec)
          : feature.a,
        b: activeTrack(feature.tracks?.b)
          ? samplePointTrack(feature.tracks.b, feature.b, targetTimeSec)
          : feature.b,
      };
    case "segment":
      return {
        ...feature,
        a0: activeTrack(feature.tracks?.a0)
          ? samplePointTrack(feature.tracks.a0, feature.a0, sourceTimeSec)
          : feature.a0,
        a1: activeTrack(feature.tracks?.a1)
          ? samplePointTrack(feature.tracks.a1, feature.a1, sourceTimeSec)
          : feature.a1,
        b0: activeTrack(feature.tracks?.b0)
          ? samplePointTrack(feature.tracks.b0, feature.b0, targetTimeSec)
          : feature.b0,
        b1: activeTrack(feature.tracks?.b1)
          ? samplePointTrack(feature.tracks.b1, feature.b1, targetTimeSec)
          : feature.b1,
      };
    case "polyline":
      return {
        ...feature,
        a: activeTrack(feature.tracks?.a)
          ? samplePointArrayTrack(feature.tracks.a, feature.a, sourceTimeSec)
          : feature.a,
        b: activeTrack(feature.tracks?.b)
          ? samplePointArrayTrack(feature.tracks.b, feature.b, targetTimeSec)
          : feature.b,
      };
    case "region":
      return {
        ...feature,
        a: activeTrack(feature.tracks?.a)
          ? samplePointArrayTrack(feature.tracks.a, feature.a, sourceTimeSec)
          : feature.a,
        b: activeTrack(feature.tracks?.b)
          ? samplePointArrayTrack(feature.tracks.b, feature.b, targetTimeSec)
          : feature.b,
      };
  }
}

export function sampleFeaturesAtTimes(
  features: FeaturePair[],
  sourceTimeSec: number,
  targetTimeSec: number,
): FeaturePair[] {
  if (!features.some(featureHasActiveTracks)) return features;
  return features.map((feature) =>
    sampleFeatureAtTimes(feature, sourceTimeSec, targetTimeSec),
  );
}

/** Sampling times closer than this step share one sampled-features identity. */
export const FEATURE_SAMPLE_QUANT_SEC = 1 / 240;

const quantizeSampleTime = (timeSec: number): number =>
  Math.round(timeSec / FEATURE_SAMPLE_QUANT_SEC);

type ProjectSampleEntry = {
  project: MorphProject;
  sourceKey: number;
  targetKey: number;
  result: MorphProject;
};

// Downstream caches (LayerProjectCache, algorithm backends) key on the
// identity of `project`/`features`; without this memo every sampled frame
// produced fresh objects and forced full TPS solves / retriangulations.
const projectSampleCache: ProjectSampleEntry[] = [];
const PROJECT_SAMPLE_CACHE_SIZE = 8;

export function projectAtFeatureTimes(
  project: MorphProject,
  sourceTimeSec: number,
  targetTimeSec: number,
): MorphProject {
  if (!project.features.some(featureHasActiveTracks)) return project;

  const sourceKey = quantizeSampleTime(sourceTimeSec);
  const targetKey = quantizeSampleTime(targetTimeSec);
  const index = projectSampleCache.findIndex(
    (entry) =>
      entry.project === project &&
      entry.sourceKey === sourceKey &&
      entry.targetKey === targetKey,
  );
  if (index >= 0) {
    const [entry] = projectSampleCache.splice(index, 1);
    projectSampleCache.push(entry);
    return entry.result;
  }

  const features = sampleFeaturesAtTimes(
    project.features,
    sourceKey * FEATURE_SAMPLE_QUANT_SEC,
    targetKey * FEATURE_SAMPLE_QUANT_SEC,
  );
  const result =
    features === project.features ? project : { ...project, features };
  projectSampleCache.push({ project, sourceKey, targetKey, result });
  if (projectSampleCache.length > PROJECT_SAMPLE_CACHE_SIZE) {
    projectSampleCache.shift();
  }
  return result;
}

export function patchFeatureHandleTrack(
  feature: FeaturePair,
  side: FeatureSide,
  key: string,
  pos: NormalizedVec2,
  timeSec: number,
  patch: FeaturePatch,
): FeaturePatch {
  switch (feature.kind) {
    case "point": {
      const field = side;
      return {
        ...patch,
        tracks: {
          ...feature.tracks,
          [field]: upsertPointTrack(feature.tracks?.[field], timeSec, pos),
        },
      } as FeaturePatch;
    }
    case "segment": {
      const field = `${side}${key === "0" ? "0" : "1"}` as
        | "a0"
        | "a1"
        | "b0"
        | "b1";
      return {
        ...patch,
        tracks: {
          ...feature.tracks,
          [field]: upsertPointTrack(feature.tracks?.[field], timeSec, pos),
        },
      } as FeaturePatch;
    }
    case "polyline":
    case "region": {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0) return patch;
      const base = side === "a" ? feature.a : feature.b;
      const existing = feature.tracks?.[side] ?? [];
      // Seed the keyframe from the one already at this time (so multi-point
      // edits within one gesture accumulate), else from the shape SAMPLED at
      // timeSec — the previous keyframe propagates instead of the contour
      // snapping back to the base shape (PRD M11 lot 4a, roto workflow).
      const atTime = existing.find(
        (item) => Math.abs(item.timeSec - timeSec) <= KEYFRAME_EPSILON_SEC,
      );
      const points = (
        atTime?.points ?? samplePointArrayTrack(existing, base, timeSec)
      ).map(clonePoint);
      if (!points[index]) return patch;
      points[index] = clonePoint(pos);
      const withoutCurrent = existing.filter(
        (item) => Math.abs(item.timeSec - timeSec) > KEYFRAME_EPSILON_SEC,
      );
      return {
        ...patch,
        tracks: {
          ...feature.tracks,
          [side]: sortedArrays([...withoutCurrent, { timeSec, points }]),
        },
      } as FeaturePatch;
    }
  }
}
