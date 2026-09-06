import type { VideoAsset } from "./video";

export const VIDEO_RELINK_DURATION_TOLERANCE_SEC = 0.1;

export type VideoRelinkErrorCode =
  | "no-saved-video"
  | "already-linked"
  | "mismatch";

export class VideoRelinkError extends Error {
  readonly code: VideoRelinkErrorCode;

  constructor(code: VideoRelinkErrorCode) {
    super(code);
    this.name = "VideoRelinkError";
    this.code = code;
  }
}

/**
 * A fingerprint is the strongest hint. Historical projects without one can
 * still be relinked using dimensions and a 100 ms duration tolerance.
 */
export function videoMatchesSavedAsset(
  saved: VideoAsset,
  candidate: VideoAsset,
): boolean {
  if (
    saved.fingerprint !== undefined &&
    candidate.fingerprint !== undefined &&
    saved.fingerprint === candidate.fingerprint
  ) {
    return true;
  }
  return (
    saved.width === candidate.width &&
    saved.height === candidate.height &&
    Math.abs(saved.durationSec - candidate.durationSec) <=
      VIDEO_RELINK_DURATION_TOLERANCE_SEC
  );
}

export function assertVideoRelinkCandidate(
  saved: VideoAsset,
  candidate: VideoAsset,
): void {
  if (!videoMatchesSavedAsset(saved, candidate)) {
    throw new VideoRelinkError("mismatch");
  }
}
