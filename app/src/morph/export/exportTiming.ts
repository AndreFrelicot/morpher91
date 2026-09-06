import type { ExportSettings, MorphProject } from "@/morph/model";
import {
  effectiveExportDuration,
  validatedFrameCount,
} from "./exportValidation";

/**
 * Number of frames to render (PRD §12.1). At least 2 so `i / (count - 1)`
 * spans the full sub-range without dividing by zero.
 */
export function computeFrameCount(
  settings: ExportSettings,
  project?: MorphProject,
): number {
  const durationSec = project
    ? effectiveExportDuration(project, settings)
    : settings.durationSec;
  return validatedFrameCount(durationSec, settings.fps);
}

/**
 * Timeline position `t` for every frame (PRD §12.1). Maps the frame index to a
 * progress in [0, 1], then into the `[startT, endT]` sub-range. With ping-pong
 * the progress is a triangle (0→1→0) so the clip plays A→B→A within the same
 * duration and loops seamlessly (first frame == last frame == startT).
 */
export function computeFrameTimes(
  settings: ExportSettings,
  project?: MorphProject,
): number[] {
  const count = computeFrameCount(settings, project);
  const { startT, endT, includePingPong } = settings;
  const span = endT - startT;

  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = i / (count - 1); // 0..1
    const phase = includePingPong ? 1 - Math.abs(1 - 2 * p) : p;
    times.push(startT + span * phase);
  }
  return times;
}
