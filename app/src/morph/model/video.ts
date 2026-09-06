import type { VideoId } from "./types";

export const MIN_VIDEO_CLIP_DURATION_SEC = 0.001;

export type VideoTimeline = {
  /** Position of the video clip on the master timeline. */
  startSec: number;
  /** Local time in the source file used at timeline start. */
  inSec: number;
  /** Played duration on the master timeline. Videos are not stretched in M9. */
  durationSec: number;
};

export type VideoAsset = {
  id: VideoId;
  name: string;
  width: number;
  height: number;
  durationSec: number;
  fps?: number;
  fingerprint?: string;
  source: {
    kind: "object-url" | "external-video-placeholder";
    value: string;
  };
  timeline: VideoTimeline;
};

export type ProjectVideos = {
  source?: VideoAsset;
  target?: VideoAsset;
};

export function defaultVideoTimeline(durationSec: number): VideoTimeline {
  return {
    startSec: 0,
    inSec: 0,
    durationSec: Math.max(0, durationSec),
  };
}

export function videoTimelineEndSec(timeline: VideoTimeline): number {
  return Math.max(0, timeline.startSec) + Math.max(0, timeline.durationSec);
}

export function normalizeVideoTimeline(
  timeline: VideoTimeline,
  videoDurationSec: number,
): VideoTimeline {
  const total = Number.isFinite(videoDurationSec)
    ? Math.max(0, videoDurationSec)
    : 0;
  const rawStart = Number.isFinite(timeline.startSec) ? timeline.startSec : 0;
  const rawIn = Number.isFinite(timeline.inSec) ? timeline.inSec : 0;
  const rawDuration = Number.isFinite(timeline.durationSec)
    ? timeline.durationSec
    : 0;
  const startSec = Math.max(0, rawStart);
  const inSec = Math.min(total, Math.max(0, rawIn));
  const maxDuration = Math.max(0, total - inSec);
  return {
    startSec,
    inSec,
    durationSec:
      maxDuration <= 0
        ? 0
        : Math.min(
            maxDuration,
            Math.max(MIN_VIDEO_CLIP_DURATION_SEC, rawDuration),
          ),
  };
}

export function normalizeVideoTimelineToMaster(
  timeline: VideoTimeline,
  videoDurationSec: number,
  masterDurationSec: number,
): VideoTimeline {
  const normalized = normalizeVideoTimeline(timeline, videoDurationSec);
  const total = Math.max(0.001, masterDurationSec);
  const durationSec = Math.min(normalized.durationSec, total);
  const startSec = Math.min(
    Math.max(0, normalized.startSec),
    Math.max(0, total - durationSec),
  );
  return {
    ...normalized,
    startSec,
    durationSec,
  };
}

export function videoActiveAt(video: VideoAsset, tauSec: number): boolean {
  const timeline = normalizeVideoTimeline(video.timeline, video.durationSec);
  if (timeline.durationSec <= 0) return false;
  return tauSec >= timeline.startSec && tauSec <= videoTimelineEndSec(timeline);
}
