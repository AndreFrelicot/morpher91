import {
  KEYFRAME_EPSILON_SEC,
  featureKeyframeTimes,
  normalizeVideoTimeline,
  imageTimelineForProject,
  videoMasterTimeSec,
  type FeatureId,
  type FeaturePair,
  type MorphProject,
  type TimelineSlot,
} from "@/morph/model";

/** One diamond on a media track: a keyframe time shared by one or more selected features. */
export type KeyframeMarker = {
  /** Side-local video seconds. */
  localSec: number;
  /** Master τ where that local time is presented. */
  masterSec: number;
  features: { id: FeatureId; name: string }[];
};

const sameTime = (a: number, b: number) =>
  Math.abs(a - b) <= KEYFRAME_EPSILON_SEC;

/**
 * Keyframe markers of the selected features for one media track (M25). Times
 * are de-duplicated across features (within one frame) and sorted; keyframes
 * outside the clip's trimmed span are dropped (they are never presented). On a
 * still image local time remains master τ, filtered to its visible clip.
 */
export function collectKeyframeMarkers(
  project: MorphProject,
  selection: readonly FeatureId[],
  slot: TimelineSlot,
  nameOf: (feature: FeaturePair, index: number) => string,
): KeyframeMarker[] {
  if (selection.length === 0) return [];
  // Still-image keys keep master time even when the image clip moves.
  const video = project.videos?.[slot];
  const imageClip = imageTimelineForProject(project, slot);
  const timeline = video
    ? normalizeVideoTimeline(video.timeline, video.durationSec)
    : { inSec: imageClip.startSec, durationSec: imageClip.durationSec };
  const minLocal = timeline.inSec - KEYFRAME_EPSILON_SEC;
  const maxLocal = timeline.inSec + timeline.durationSec + KEYFRAME_EPSILON_SEC;
  const side = slot === "source" ? "a" : "b";
  const markers: KeyframeMarker[] = [];
  project.features.forEach((feature, index) => {
    if (!selection.includes(feature.id)) return;
    const entry = { id: feature.id, name: nameOf(feature, index) };
    for (const localSec of featureKeyframeTimes(feature, side)) {
      if (localSec < minLocal || localSec > maxLocal) continue;
      const existing = markers.find((m) => sameTime(m.localSec, localSec));
      if (existing) {
        existing.features.push(entry);
      } else {
        markers.push({
          localSec,
          masterSec: videoMasterTimeSec(project, slot, localSec),
          features: [entry],
        });
      }
    }
  });
  return markers.sort((a, b) => a.masterSec - b.masterSec);
}

export type KeyframeMarkerGroup = { markers: KeyframeMarker[] };

/**
 * Merges consecutive markers closer than `minGapPx` (at the track's pixel
 * width) into one group: a dense run renders as a single read-only bar.
 */
export function groupKeyframeMarkers(
  markers: KeyframeMarker[],
  totalSec: number,
  widthPx: number,
  minGapPx: number,
): KeyframeMarkerGroup[] {
  const groups: KeyframeMarkerGroup[] = [];
  for (const marker of markers) {
    const last = groups[groups.length - 1];
    const previous = last?.markers[last.markers.length - 1];
    if (
      previous &&
      widthPx > 0 &&
      ((marker.masterSec - previous.masterSec) / Math.max(0.001, totalSec)) *
        widthPx <
        minGapPx
    ) {
      last.markers.push(marker);
    } else {
      groups.push({ markers: [marker] });
    }
  }
  return groups;
}
