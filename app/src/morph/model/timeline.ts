import type { MorphProject } from "./project";
import type { ImageTimeline } from "./image";
import {
  normalizeVideoTimeline,
  videoActiveAt,
  videoTimelineEndSec,
  type VideoAsset,
} from "./video";

export type TimelineSlot = "source" | "target";

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function imageTimelineForProject(
  project: MorphProject,
  slot: TimelineSlot,
): ImageTimeline {
  return (
    project.images[slot].timeline ?? {
      startSec: 0,
      durationSec: project.timeline.durationSec,
    }
  );
}

export function timelineDurationSec(project: MorphProject | null): number {
  return Math.max(0.001, project?.timeline.durationSec ?? 4);
}

export function tauToProgress(
  project: MorphProject | null,
  tauSec: number,
): number {
  return clamp01(tauSec / timelineDurationSec(project));
}

export function progressToTau(
  project: MorphProject | null,
  progress: number,
): number {
  return clamp01(progress) * timelineDurationSec(project);
}

export function videoLocalTimeSec(
  project: MorphProject,
  slot: TimelineSlot,
  tauSec: number,
): number {
  const video = project.videos?.[slot];
  if (!video) return tauSec;

  const timeline = normalizeVideoTimeline(video.timeline, video.durationSec);
  const inSec = timeline.inSec;
  const durationSec = timeline.durationSec;
  const local = inSec + (tauSec - Math.max(0, timeline.startSec));
  const maxLocal = Math.min(video.durationSec, inSec + durationSec);
  return Math.min(maxLocal, Math.max(inSec, local));
}

/**
 * Inverse of {@link videoLocalTimeSec}: master τ at which a side-local video
 * time is presented, clamped to the clip span (M11 lot 4a — jump to keyframe).
 */
export function videoMasterTimeSec(
  project: MorphProject,
  slot: TimelineSlot,
  localSec: number,
): number {
  const video = project.videos?.[slot];
  if (!video) return localSec;

  const timeline = normalizeVideoTimeline(video.timeline, video.durationSec);
  const tau = Math.max(0, timeline.startSec) + (localSec - timeline.inSec);
  return Math.min(
    videoTimelineEndSec(timeline),
    Math.max(timeline.startSec, tau),
  );
}

export function videoFrameAvailableAt(
  project: MorphProject,
  slot: TimelineSlot,
  tauSec: number,
): boolean {
  const video = project.videos?.[slot];
  if (video) return videoActiveAt(video, tauSec);
  const timeline = project.images[slot].timeline;
  // Preserve the implicit full-length presence of older projects.
  return (
    !timeline ||
    (tauSec >= timeline.startSec &&
      tauSec <= timeline.startSec + timeline.durationSec)
  );
}

/**
 * Applies the master-timeline visibility policy to a source/target frame pair.
 *
 * Images and videos are available only inside their clips; legacy images
 * without a clip span the montage. When just one side is present, both morph
 * inputs use that side so the absent media cannot ghost into the dissolve; when neither side is present,
 * callers render an empty frame. Preview and offline export both use this
 * helper so their media visibility cannot drift apart.
 */
export function resolveTimelineFramePair<T>(
  project: MorphProject,
  tauSec: number,
  pair: { a: T; b: T },
): { a: T; b: T } | null {
  const sourceAvailable = videoFrameAvailableAt(project, "source", tauSec);
  const targetAvailable = videoFrameAvailableAt(project, "target", tauSec);

  if (sourceAvailable && targetAvailable) return pair;
  if (sourceAvailable) return { a: pair.a, b: pair.a };
  if (targetAvailable) return { a: pair.b, b: pair.b };
  return null;
}

export function videoClipStatus(
  video: VideoAsset | undefined,
  tauSec: number,
): "none" | "active" | "before" | "after" | "empty" {
  if (!video) return "none";
  const timeline = normalizeVideoTimeline(video.timeline, video.durationSec);
  if (timeline.durationSec <= 0) return "empty";
  if (tauSec < timeline.startSec) return "before";
  if (tauSec > videoTimelineEndSec(timeline)) return "after";
  return "active";
}

export function timelineEndSec(project: MorphProject): number {
  const videoDurationSec = Object.values(project.videos ?? {}).reduce(
    (sum, video) => sum + Math.max(0, video?.durationSec ?? 0),
    0,
  );
  const imageEnds = (["source", "target"] as const).flatMap((slot) => {
    const clip = !project.videos?.[slot] && project.images[slot].timeline;
    return clip ? [clip.startSec + clip.durationSec] : [];
  });
  return Math.max(
    videoDurationSec || project.timeline.durationSec,
    // Explicit image clips may extend beyond the available video footage.
    ...(imageEnds.length ? [project.timeline.durationSec, ...imageEnds] : []),
    0.001,
  );
}
