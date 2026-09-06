import type { Rect } from "@/lib/viewport/projectSpace";
import type { MorphAlgorithmId, MorphProject } from "@/morph/model";

/** A placed source/target image, ready to sample. */
export type GpuImageSlot = {
  view: GPUTextureView;
  width: number;
  height: number;
};

/** Everything a backend needs to draw one frame. */
export type MorphFrame = {
  /** Destination view (the canvas texture, or an intermediate). */
  target: GPUTextureView;
  canvasWidth: number;
  canvasHeight: number;
  a: GpuImageSlot;
  b: GpuImageSlot;
  /** Warp position 0..1: the intermediate shape both images are warped to. */
  t: number;
  /**
   * Dissolve position 0..1 (defaults to {@link t}). Layer transition windows
   * (PRD §9.2) let the crossfade run on a shorter window than the warp.
   */
  dissolveT?: number;
  /** Master timeline time in seconds, used by video/layer clips. */
  tauSec?: number;
  /** Local source/target media times for temporal feature tracks. */
  sourceTimeSec?: number;
  targetTimeSec?: number;
  /** Source of features, canvas aspect and per-algorithm settings. */
  project: MorphProject;
  /**
   * Project content box in canvas px. Defaults to the letterboxed containRect;
   * the studio preview passes a zoomed/panned box (may extend past the canvas)
   * so the morph renders through the shared viewport.
   */
  contentRect?: Rect;
};

/**
 * Common interface for every morph algorithm (PRD §10.1). All backends follow
 * "warp both images into the same intermediate shape at t, then dissolve".
 *
 * Deviation from the PRD's async `prepare`/`MorphPreparedState`: pipelines are
 * created synchronously and per-device, so a backend is built once with the
 * device + canvas format (like {@link CrossfadeRenderer}) and draws via
 * {@link renderFrame}. Kept minimal — no speculative preparation step.
 */
/** Target format of {@link MorphBackend.renderWarpMap} (signed, out-of-range UVs). */
export const WARP_MAP_FORMAT: GPUTextureFormat = "rgba16float";

export interface MorphBackend {
  readonly id: MorphAlgorithmId;
  renderFrame(frame: MorphFrame): void;
  /**
   * Optional warp-map pass: writes into `frame.target` (a {@link WARP_MAP_FORMAT}
   * texture) the Project Space position each output pixel samples image A from
   * — the A-side backward warp of the same frame. The layer compositor samples
   * painted masks through it, so a mask authored over the un-warped source
   * follows the morph (M17 painted-mask advection).
   */
  renderWarpMap?(frame: MorphFrame): void;
  dispose(): void;
}
