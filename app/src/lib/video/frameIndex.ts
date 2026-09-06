/**
 * Frame indexing on a video track's OWN frame rate (M23). The scrub cache is
 * keyed by source frame, not by timeline frame: on a 24 fps clip scrubbed at
 * 30 fps, two timeline steps often land on the same decoded image, and keying
 * them apart would decode (and cache) that image twice.
 */

/** Guards against sample times a hair below a frame boundary. */
const FRAME_INDEX_EPSILON = 1e-6;

/**
 * Index of the frame presented at `timeSec` — the last frame whose timestamp
 * is at or before it — for a track starting at `firstTimestampSec` and running
 * at `fps`. Times before the first frame map to index 0.
 */
export function frameIndexForTime(
  timeSec: number,
  firstTimestampSec: number,
  fps: number,
): number {
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(
    0,
    Math.floor((timeSec - firstTimestampSec) * fps + FRAME_INDEX_EPSILON),
  );
}

/** Presentation time of frame `index` on the same track. */
export function timeForFrameIndex(
  index: number,
  firstTimestampSec: number,
  fps: number,
): number {
  return firstTimestampSec + index / fps;
}
