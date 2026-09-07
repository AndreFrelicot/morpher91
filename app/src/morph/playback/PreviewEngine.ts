import {
  timelineDurationSec,
  videoFrameAvailableAt,
  videoLocalTimeSec,
  type MorphProject,
} from "@/morph/model";
import type { GpuImageSlot } from "@/morph/algorithms/MorphBackend";
import { VideoSource, type SourceInput } from "./VideoSource";

/** What a viewport needs to draw one synced frame. */
export type FrameContext = {
  tauSec: number;
  /** Normalized progress 0..1, for backends that warp/dissolve by `t`. */
  t: number;
};

export type FrameListener = (frame: FrameContext) => void;

/** Max drift before a corrective seek brings a side back in step with τ. */
const MAX_DRIFT_SEC = 0.05;

/**
 * Single source of A/B frames for every on-screen viewport (PRD M10). Decodes
 * each side once into a shared texture and, on every tick, uploads both sides
 * and notifies its listeners — so the morph preview, the source/target panes and
 * the Compare cells all sample the SAME `texA`/`texB` at the SAME τ. That makes
 * inter-viewport desync impossible by construction.
 *
 * Playback advances τ on a wall clock and slaves both videos to it (they play
 * natively and are nudged back when they drift past {@link MAX_DRIFT_SEC}). This
 * is robust for every clip layout — sequential, overlapping, gaps, end of
 * timeline — while the shared textures keep the viewports frame-locked. `sync`
 * is the exact scrub/idle path; both share {@link applyFrame} and are coalesced
 * so concurrent seeks never overlap.
 */
export class PreviewEngine {
  private readonly source: VideoSource;
  private readonly target: VideoSource;
  private project: MorphProject;
  private readonly listeners = new Set<FrameListener>();

  private playing = false;
  private onTau: ((tauSec: number) => void) | null = null;
  private rafHandle: number | null = null;
  private playGeneration = 0;
  private syncGeneration = 0;
  private syncTail: Promise<void> = Promise.resolve();
  private readerReadyListener: (() => void) | null = null;

  constructor(
    device: GPUDevice,
    source: SourceInput,
    target: SourceInput,
    project: MorphProject,
  ) {
    const onReaderOpen = () => this.readerReadyListener?.();
    this.source = new VideoSource(device, source, onReaderOpen);
    this.target = new VideoSource(device, target, onReaderOpen);
    this.project = project;
  }

  /** Called whenever a side's WebCodecs reader becomes available (M23) — the
   * driver uses it to start the idle decode work without waiting for a τ. */
  setReaderReadyListener(listener: (() => void) | null): void {
    this.readerReadyListener = listener;
  }

  /** The shared A/B texture slots every viewport samples. */
  slots(): { a: GpuImageSlot; b: GpuImageSlot } {
    return { a: this.source.slot, b: this.target.slot };
  }

  /** Per-side upload counters — unchanged ⇒ that side's texture is unchanged. */
  uploadCounts(): { a: number; b: number } {
    return { a: this.source.uploadCount, b: this.target.uploadCount };
  }

  /** Refreshes the project used for time mapping (features/timeline edits). */
  setProject(project: MorphProject): void {
    this.project = project;
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Ensures both sides hold the frame for `tauSec`, uploads them and notifies.
   * `realtime` lets active videos keep playing (smooth); otherwise they are
   * paused and seeked exactly (scrub). Calls are serialized, and an obsolete
   * in-flight seek never uploads or publishes after a newer request.
   */
  sync(tauSec: number, { realtime = false } = {}): Promise<void> {
    const generation = ++this.syncGeneration;
    const playbackGeneration = this.playGeneration;
    const run = this.syncTail
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.syncGeneration) return;
        await this.applyFrame(tauSec, realtime, generation, playbackGeneration);
      });
    this.syncTail = run;
    return run;
  }

  /** Invalidates an obsolete in-flight seek before a coalesced replacement runs. */
  invalidatePendingSync(): void {
    this.syncGeneration++;
  }

  /** Starts realtime playback from `startTauSec`; `onTau` receives authoritative τ. */
  play(startTauSec: number, onTau: (tauSec: number) => void): void {
    this.stopClock();
    const generation = ++this.playGeneration;
    this.playing = true;
    this.onTau = onTau;
    let tau = startTauSec;
    let last = performance.now();
    const step = (now: number) => {
      if (!this.playing || generation !== this.playGeneration) return;
      const dt = (now - last) / 1000;
      last = now;
      const duration = this.duration();
      tau += dt;
      if (tau >= duration) tau -= Math.floor(tau / duration) * duration;
      void this.sync(tau, { realtime: true });
      this.onTau?.(tau);
      this.rafHandle = requestAnimationFrame(step);
    };
    this.rafHandle = requestAnimationFrame(step);
  }

  pause(): void {
    this.invalidatePendingSync();
    this.playing = false;
    this.playGeneration++;
    this.stopClock();
    this.source.pause();
    this.target.pause();
  }

  /**
   * Idle decode work after a settled scrub (M22/M23), in priority order:
   * 1. the presented frame at full resolution when a side showed its proxy
   *    (then re-emit so viewports redraw the sharp frame);
   * 2. the neighbours of τ into the full-resolution cache;
   * 3. the whole-clip proxy sweep.
   * Sides run back to back — they share one hardware decoder — and every
   * step stops within a frame once `shouldContinue` is false.
   */
  async predecodeAround(
    tauSec: number,
    shouldContinue: () => boolean,
  ): Promise<void> {
    if (!shouldContinue()) return;
    const fps = this.project.timeline.fps;
    const sourceLocal = videoLocalTimeSec(this.project, "source", tauSec);
    const targetLocal = videoLocalTimeSec(this.project, "target", tauSec);

    const sourceSharp = await this.source.ensureFullResCurrent(
      fps,
      shouldContinue,
    );
    if (!shouldContinue()) return;
    const targetSharp = await this.target.ensureFullResCurrent(
      fps,
      shouldContinue,
    );
    if (!shouldContinue()) return;
    if (sourceSharp || targetSharp) this.emit(tauSec);

    await this.source.predecodeAround(sourceLocal, fps, shouldContinue);
    if (!shouldContinue()) return;
    await this.target.predecodeAround(targetLocal, fps, shouldContinue);
    if (!shouldContinue()) return;

    await this.source.sweepProxy(shouldContinue);
    if (!shouldContinue()) return;
    await this.target.sweepProxy(shouldContinue);
  }

  dispose(): void {
    this.syncGeneration++;
    this.pause();
    this.listeners.clear();
    this.source.dispose();
    this.target.dispose();
  }

  private stopClock(): void {
    if (this.rafHandle === null) return;
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }

  private async applyFrame(
    tauSec: number,
    realtime: boolean,
    generation: number,
    playbackGeneration: number,
  ): Promise<void> {
    const sourceLocal = videoLocalTimeSec(this.project, "source", tauSec);
    const targetLocal = videoLocalTimeSec(this.project, "target", tauSec);
    const sourceActive = videoFrameAvailableAt(this.project, "source", tauSec);
    const targetActive = videoFrameAvailableAt(this.project, "target", tauSec);
    const fps = this.project.timeline.fps;
    const shouldCompleteRealtimeFrame = () =>
      generation === this.syncGeneration ||
      (realtime && this.playing && playbackGeneration === this.playGeneration);
    const completedRealtimeFrame = (
      await Promise.all([
        this.presentSide(
          this.source,
          sourceLocal,
          realtime && sourceActive,
          fps,
          () => generation === this.syncGeneration,
          shouldCompleteRealtimeFrame,
        ),
        this.presentSide(
          this.target,
          targetLocal,
          realtime && targetActive,
          fps,
          () => generation === this.syncGeneration,
          shouldCompleteRealtimeFrame,
        ),
      ])
    ).some(Boolean);
    // Exact scrub requests must remain latest-wins. During playback, however,
    // a corrective seek or fallback decode may span more than one RAF. Present
    // the frame that did finish while this playback session is still active;
    // the queued latest tick catches up next. Discarding every completed frame
    // here otherwise starves the video textures while τ keeps moving.
    if (
      generation !== this.syncGeneration &&
      (!realtime || !this.playing || !completedRealtimeFrame)
    ) {
      return;
    }
    this.source.presentCurrent();
    this.target.presentCurrent();
    this.emit(tauSec);
  }

  private async presentSide(
    src: VideoSource,
    localSec: number,
    realtime: boolean,
    fps: number,
    shouldContinue: () => boolean,
    shouldCompleteRealtimeFrame: () => boolean,
  ): Promise<boolean> {
    if (!shouldContinue() || !src.hasVideo) return false; // static texture already holds the bitmap
    if (realtime) {
      const corrected = src.driftsFrom(localSec, MAX_DRIFT_SEC);
      if (corrected) await src.seekTo(localSec);
      // A completed correction is worth presenting even if the next RAF was
      // queued while the seek ran. The queued tick catches up immediately.
      if (!shouldContinue()) return corrected;
      if (await src.play()) return corrected;

      // Zen and hardened Firefox profiles can reject play() for a detached
      // muted element. Drive only that side through the same frame-exact path
      // used by scrubbing; native playback remains unchanged everywhere it
      // starts successfully. This work may outlive a newer RAF, but never a
      // pause or a replacement playback session.
      await src.prepareScrubFrame(localSec, fps, shouldCompleteRealtimeFrame);
      return true;
    } else {
      await src.prepareScrubFrame(localSec, fps, shouldContinue);
      return false;
    }
  }

  private duration(): number {
    return timelineDurationSec(this.project);
  }

  private emit(tauSec: number): void {
    const duration = this.duration();
    const t = duration > 0 ? Math.min(1, Math.max(0, tauSec / duration)) : 0;
    const frame: FrameContext = { tauSec, t };
    for (const listener of this.listeners) listener(frame);
  }
}
