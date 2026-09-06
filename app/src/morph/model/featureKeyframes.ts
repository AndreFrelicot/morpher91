import type {
  FeaturePair,
  FeaturePatch,
  TimedPoint,
  TimedPointArray,
} from "./features";
import type { FeatureSide } from "./featureHandles";
import {
  KEYFRAME_EPSILON_SEC,
  samplePointArrayTrack,
  samplePointTrack,
  upsertPointArrayTrack,
  upsertPointTrack,
} from "./featureTimeline";

/**
 * Keyframe inspection/authoring helpers for one feature side (PRD M11 lot 4a).
 * Times are SIDE-LOCAL video seconds — the same clock the tracks are sampled
 * with (`videoLocalTimeSec`); map to master τ with `videoMasterTimeSec`.
 */

const sameTime = (a: number, b: number): boolean =>
  Math.abs(a - b) <= KEYFRAME_EPSILON_SEC;

function segmentFields(side: FeatureSide): ["a0" | "b0", "a1" | "b1"] {
  return side === "a" ? ["a0", "a1"] : ["b0", "b1"];
}

/** Sorted, de-duplicated keyframe times of one side's track(s). */
export function featureKeyframeTimes(
  feature: FeaturePair,
  side: FeatureSide,
): number[] {
  const times: number[] = [];
  const push = (timeSec: number) => {
    if (!times.some((t) => sameTime(t, timeSec))) times.push(timeSec);
  };
  switch (feature.kind) {
    case "point":
      (feature.tracks?.[side] ?? []).forEach((k: TimedPoint) =>
        push(k.timeSec),
      );
      break;
    case "segment":
      for (const field of segmentFields(side)) {
        (feature.tracks?.[field] ?? []).forEach((k: TimedPoint) =>
          push(k.timeSec),
        );
      }
      break;
    case "polyline":
    case "region":
      (feature.tracks?.[side] ?? []).forEach((k: TimedPointArray) =>
        push(k.timeSec),
      );
      break;
  }
  return times.sort((a, b) => a - b);
}

/** True when the side has a keyframe at (within one frame of) `timeSec`. */
export function hasFeatureKeyframeAt(
  feature: FeaturePair,
  side: FeatureSide,
  timeSec: number,
): boolean {
  return featureKeyframeTimes(feature, side).some((t) => sameTime(t, timeSec));
}

/**
 * Patch posing a full keyframe at `timeSec`, capturing the shape SAMPLED at
 * that time — so an explicit keyframe holds the propagated/interpolated state
 * before any adjustment (the roto workflow's "propagate then tweak").
 */
export function setFeatureKeyframe(
  feature: FeaturePair,
  side: FeatureSide,
  timeSec: number,
): FeaturePatch {
  switch (feature.kind) {
    case "point": {
      const track = feature.tracks?.[side];
      return {
        tracks: {
          ...feature.tracks,
          [side]: upsertPointTrack(
            track,
            timeSec,
            samplePointTrack(track, feature[side], timeSec),
          ),
        },
      } as FeaturePatch;
    }
    case "segment": {
      const [f0, f1] = segmentFields(side);
      return {
        tracks: {
          ...feature.tracks,
          [f0]: upsertPointTrack(
            feature.tracks?.[f0],
            timeSec,
            samplePointTrack(feature.tracks?.[f0], feature[f0], timeSec),
          ),
          [f1]: upsertPointTrack(
            feature.tracks?.[f1],
            timeSec,
            samplePointTrack(feature.tracks?.[f1], feature[f1], timeSec),
          ),
        },
      } as FeaturePatch;
    }
    case "polyline":
    case "region": {
      const track = feature.tracks?.[side];
      return {
        tracks: {
          ...feature.tracks,
          [side]: upsertPointArrayTrack(
            track,
            timeSec,
            samplePointArrayTrack(track, feature[side], timeSec),
          ),
        },
      } as FeaturePatch;
    }
  }
}

/** Patch removing the side's keyframe at `timeSec`; null when none is there. */
export function removeFeatureKeyframe(
  feature: FeaturePair,
  side: FeatureSide,
  timeSec: number,
): FeaturePatch | null {
  if (!hasFeatureKeyframeAt(feature, side, timeSec)) return null;
  const drop = <T extends { timeSec: number }>(track: T[] | undefined): T[] =>
    (track ?? []).filter((item) => !sameTime(item.timeSec, timeSec));
  switch (feature.kind) {
    case "point":
      return {
        tracks: { ...feature.tracks, [side]: drop(feature.tracks?.[side]) },
      } as FeaturePatch;
    case "segment": {
      const [f0, f1] = segmentFields(side);
      return {
        tracks: {
          ...feature.tracks,
          [f0]: drop(feature.tracks?.[f0]),
          [f1]: drop(feature.tracks?.[f1]),
        },
      } as FeaturePatch;
    }
    case "polyline":
    case "region":
      return {
        tracks: { ...feature.tracks, [side]: drop(feature.tracks?.[side]) },
      } as FeaturePatch;
  }
}

/**
 * Patch retiming the side's keyframe at `fromSec` to `toSec` (M25). Null when
 * no keyframe is there, or when `toSec` collides with ANOTHER keyframe of the
 * side (within one frame) — the UI clamps a drag before that, the model still
 * refuses. The shape stored on the keyframe is kept as is.
 */
export function moveFeatureKeyframe(
  feature: FeaturePair,
  side: FeatureSide,
  fromSec: number,
  toSec: number,
): FeaturePatch | null {
  if (!hasFeatureKeyframeAt(feature, side, fromSec)) return null;
  const collides = featureKeyframeTimes(feature, side).some(
    (t) => !sameTime(t, fromSec) && sameTime(t, toSec),
  );
  if (collides) return null;
  const retime = <T extends { timeSec: number }>(track: T[] | undefined): T[] =>
    (track ?? [])
      .map((item) =>
        sameTime(item.timeSec, fromSec) ? { ...item, timeSec: toSec } : item,
      )
      .sort((a, b) => a.timeSec - b.timeSec);
  switch (feature.kind) {
    case "point":
      return {
        tracks: { ...feature.tracks, [side]: retime(feature.tracks?.[side]) },
      } as FeaturePatch;
    case "segment": {
      const [f0, f1] = segmentFields(side);
      return {
        tracks: {
          ...feature.tracks,
          [f0]: retime(feature.tracks?.[f0]),
          [f1]: retime(feature.tracks?.[f1]),
        },
      } as FeaturePatch;
    }
    case "polyline":
    case "region":
      return {
        tracks: { ...feature.tracks, [side]: retime(feature.tracks?.[side]) },
      } as FeaturePatch;
  }
}
