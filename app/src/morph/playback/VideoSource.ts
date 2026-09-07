import type { GpuImageSlot } from "@/morph/algorithms/MorphBackend";
import {
  createImageTexture,
  uploadExternalImageToTexture,
} from "@/morph/gpu/textures";
import {
  createVideoElementForUrl,
  seekVideoElement,
  type LoadedVideo,
} from "@/lib/video/loadVideo";
import { WebCodecsVideoReader } from "@/lib/video/WebCodecsVideoReader";
import { frameIndexForTime, timeForFrameIndex } from "@/lib/video/frameIndex";
import { matchesConstrainedGpuProfile } from "@/lib/gpu/constrainedProfile";
import { ProxyBlitter } from "./proxyBlit";
import {
  VIDEO_PROXY_ENABLED,
  PROXY_BUDGET_BYTES,
  PROXY_BUDGET_BYTES_CONSTRAINED,
  planProxy,
  type ProxyPlan,
} from "./proxyScale";

/** Source content for one side: a poster/static bitmap and an optional video. */
export type SourceInput = {
  bitmap: ImageBitmap;
  video: LoadedVideo | null;
};

/** Frame-indexed GPU texture budget per side for the scrub cache (M22). */
const FRAME_CACHE_LIMIT = 48;
const FRAME_CACHE_LIMIT_CONSTRAINED = 16;

type CachedFrame = {
  frameIndex: number;
  texture: GPUTexture;
  slot: GpuImageSlot;
};

const FRAME_COUNT_EPSILON = 1e-6;

/**
 * One side (source or target) of the preview, decoded ONCE. Owns a single
 * `<video>` element (or a static bitmap) and a single GPU texture that every
 * viewport samples — the morph preview, the side pane, and the Compare cells all
 * read this same texture, which is what keeps them frame-locked (PRD M10).
 *
 * Low-level primitives only: upload the current frame, seek and play/pause.
 * Playback policy lives in {@link PreviewEngine}.
 */
export class VideoSource {
  readonly hasVideo: boolean;
  private readonly device: GPUDevice;
  private readonly element: HTMLVideoElement | null;
  private readonly texture: GPUTexture;
  private readonly _slot: GpuImageSlot;
  private readonly width: number;
  private readonly height: number;
  private _uploadCount = 0;
  private lastUploadedTimeSec: number | null = null;
  private readonly videoDurationSec: number;
  private currentSlot: GpuImageSlot;
  private reader: WebCodecsVideoReader | null = null;
  private readonly frameCache: CachedFrame[] = [];
  private readonly frameCacheLimit: number;
  private pendingCached: CachedFrame | null = null;
  private pendingIndex: number | null = null;
  private pendingIsProxy = false;
  private currentIndex: number | null = null;
  private currentIsProxy = false;
  // Whole-clip reduced-resolution proxy tier (M23): every frame, never evicted.
  private readonly proxyFrames = new Map<number, CachedFrame>();
  private readonly proxyBudgetBytes: number;
  private proxyBlitter: ProxyBlitter | null = null;
  private proxyPlan: ProxyPlan | null | undefined; // undefined ⇒ not planned yet
  private proxyNextIndex = 0;
  private proxyComplete = false;
  private readonly onReaderOpen: (() => void) | null;
  private disposed = false;

  constructor(
    device: GPUDevice,
    input: SourceInput,
    onReaderOpen: (() => void) | null = null,
  ) {
    this.device = device;
    this.onReaderOpen = onReaderOpen;
    this.hasVideo = input.video !== null;
    this.videoDurationSec = input.video?.asset.durationSec ?? 0;
    this.width = input.video?.asset.width ?? input.bitmap.width;
    this.height = input.video?.asset.height ?? input.bitmap.height;
    this.texture = createImageTexture(device, input.bitmap, {
      width: this.width,
      height: this.height,
    });
    this._slot = {
      view: this.texture.createView(),
      width: this.width,
      height: this.height,
    };
    this.currentSlot = this._slot;
    const constrained = matchesConstrainedGpuProfile();
    this.frameCacheLimit = constrained
      ? FRAME_CACHE_LIMIT_CONSTRAINED
      : FRAME_CACHE_LIMIT;
    // Native-resolution previews by default during the iPad recording trial.
    // Keep the original full-frame cache limits; do not cache the whole clip.
    this.proxyBudgetBytes = !VIDEO_PROXY_ENABLED
      ? 0
      : constrained
        ? PROXY_BUDGET_BYTES_CONSTRAINED
        : PROXY_BUDGET_BYTES;
    this.element = input.video
      ? createVideoElementForUrl(input.video.objectUrl)
      : null;
    if (input.video) {
      // Opportunistic WebCodecs decode path for scrubbing; until (or unless)
      // it resolves, prepareScrubFrame falls back to the <video> element.
      void WebCodecsVideoReader.open(input.video.objectUrl).then((reader) => {
        if (this.disposed) {
          reader?.dispose();
          return;
        }
        this.reader = reader;
        if (reader) this.onReaderOpen?.();
      });
    }
  }

  /** Number of frames held by the proxy tier (diagnostics/tests). */
  get proxyFrameCount(): number {
    return this.proxyFrames.size;
  }

  /** The slot viewports sample — the base texture or a cached scrub frame. */
  get slot(): GpuImageSlot {
    return this.currentSlot;
  }

  /** Monotonic count of texture uploads — unchanged ⇒ unchanged pixels. */
  get uploadCount(): number {
    return this._uploadCount;
  }

  /** Copies the frame currently presented by the element into the texture. */
  uploadCurrent(): void {
    if (!this.element) return;
    // Same presented frame (identical currentTime on a seek-idempotent or
    // out-of-clip sync): the texture already holds these pixels — skip the
    // copy so unchanged panes can skip their redraw entirely.
    if (this.element.currentTime === this.lastUploadedTimeSec) return;
    uploadExternalImageToTexture(this.device, this.texture, this.element, {
      width: this.width,
      height: this.height,
    });
    this.lastUploadedTimeSec = this.element.currentTime;
    this._uploadCount++;
  }

  /** Pauses and seeks to `localSec` (idempotent within a frame). */
  async seekTo(localSec: number): Promise<void> {
    if (!this.element) return;
    this.element.pause();
    await seekVideoElement(this.element, localSec);
  }

  /**
   * Scrub path (M22): makes the exact frame for `localSec` available. With the
   * WebCodecs reader, frames are decoded frame-exactly into an LRU of GPU
   * textures indexed by SOURCE frame number (the track's own frame rate, M23;
   * `fps` is the timeline fallback when that rate is unknown) — a revisited
   * frame costs zero seek and zero upload, and timeline steps landing on the
   * same source frame share one decode. Without the reader (or on a decode
   * miss) it falls back to the `<video>` element seek; {@link presentCurrent}
   * then uploads.
   */
  async prepareScrubFrame(
    localSec: number,
    fps: number,
    shouldContinue: () => boolean = () => true,
  ): Promise<void> {
    this.setPending(null, null, false);
    if (!shouldContinue() || this.disposed || !this.element) return; // static bitmap already in the base texture
    this.element.pause();
    if (this.reader && this.frameRate(fps) > 0) {
      const frameIndex = this.frameIndexAt(localSec, fps);
      const hit = this.cacheGet(frameIndex);
      if (hit) {
        this.setPending(hit, frameIndex, false);
        return;
      }
      const proxy = this.proxyFrames.get(frameIndex);
      if (proxy) {
        // Progressive scrub (M23): show the reduced frame right away; the
        // full-resolution decode waits for the idle pass
        // ({@link ensureFullResCurrent}) so a drag never blocks on a decode.
        this.setPending(proxy, frameIndex, true);
        return;
      }
      const frame = await this.reader.scrubFrameAt(localSec, shouldContinue);
      if (!shouldContinue() || this.disposed) {
        frame?.close();
        return;
      }
      if (frame) {
        this.setPending(this.cachePut(frameIndex, frame), frameIndex, false);
        return;
      }
    }
    if (shouldContinue() && !this.disposed)
      await seekVideoElement(this.element, localSec);
  }

  private setPending(
    entry: CachedFrame | null,
    frameIndex: number | null,
    isProxy: boolean,
  ): void {
    this.pendingCached = entry;
    this.pendingIndex = frameIndex;
    this.pendingIsProxy = isProxy;
  }

  /**
   * Idle pass (M23): when the presented frame came from the proxy tier,
   * decodes it at full resolution and swaps the presented slot. Resolves true
   * when the slot changed (the caller re-emits so viewports redraw).
   */
  async ensureFullResCurrent(
    fps: number,
    shouldContinue: () => boolean,
  ): Promise<boolean> {
    if (
      !shouldContinue() ||
      this.disposed ||
      !this.reader ||
      !this.currentIsProxy ||
      this.currentIndex === null
    ) {
      return false;
    }
    const frameIndex = this.currentIndex;
    let entry = this.cacheGet(frameIndex);
    if (!entry) {
      const frame = await this.reader.frameAt(
        this.frameTimeAt(frameIndex, fps),
        () =>
          shouldContinue() &&
          !this.disposed &&
          this.currentIsProxy &&
          this.currentIndex === frameIndex,
      );
      if (!frame) return false;
      if (
        !shouldContinue() ||
        this.disposed ||
        !this.currentIsProxy ||
        this.currentIndex !== frameIndex
      ) {
        frame.close();
        return false;
      }
      entry = this.cachePut(frameIndex, frame);
    }
    this.currentSlot = entry.slot;
    this.currentIsProxy = false;
    return true;
  }

  /**
   * Whole-clip proxy sweep (M23): decodes the clip sequentially from where the
   * previous sweep stopped and keeps every frame as a reduced texture, so any
   * τ has an image ready at the next vsync. Runs only while `shouldContinue`
   * holds (idle, not playing); resumes on the next idle pass. Skipped when
   * the track's frame rate is unknown or no scale fits the budget.
   */
  async sweepProxy(shouldContinue: () => boolean): Promise<void> {
    if (!this.element || !this.reader || this.proxyComplete) return;
    if (this.reader.nativeFps === null) return;
    const rate = this.reader.nativeFps;
    if (!(rate > 0)) return;
    const lastIndex = this.lastFrameIndex(rate);
    if (this.proxyPlan === undefined) {
      this.proxyPlan = planProxy(
        lastIndex + 1,
        this.width,
        this.height,
        this.proxyBudgetBytes,
      );
    }
    const plan = this.proxyPlan;
    if (!plan) return;
    if (this.proxyNextIndex > lastIndex) {
      this.proxyComplete = true;
      return;
    }
    this.proxyBlitter ??= new ProxyBlitter(this.device);
    const blitter = this.proxyBlitter;
    const firstTimestampSec = this.reader.firstTimestampSec;
    await this.reader.framesInRange(
      timeForFrameIndex(this.proxyNextIndex, firstTimestampSec, rate),
      timeForFrameIndex(lastIndex + 1, firstTimestampSec, rate),
      (frame, timestampSec) => {
        try {
          const i = frameIndexForTime(timestampSec, firstTimestampSec, rate);
          if (!this.proxyFrames.has(i)) {
            const texture = blitter.createTarget(plan.width, plan.height);
            blitter.blit(frame, texture);
            this.proxyFrames.set(i, {
              frameIndex: i,
              texture,
              slot: {
                view: texture.createView(),
                width: plan.width,
                height: plan.height,
              },
            });
          }
          this.proxyNextIndex = Math.max(this.proxyNextIndex, i + 1);
        } finally {
          frame.close();
        }
      },
      () => shouldContinue() && !this.disposed,
    );
    // The stream ran to its end (not interrupted) or covered the last index.
    const interrupted = !shouldContinue() || this.disposed;
    if (!interrupted || this.proxyNextIndex > lastIndex) {
      this.proxyComplete = true;
    }
  }

  /** Index of the clip's last frame at `rate` frames per second. */
  private lastFrameIndex(rate: number): number {
    return Math.max(
      0,
      Math.ceil(this.videoDurationSec * rate - FRAME_COUNT_EPSILON) - 1,
    );
  }

  private frameTimeAt(frameIndex: number, fps: number): number {
    return timeForFrameIndex(
      frameIndex,
      this.reader?.firstTimestampSec ?? 0,
      this.frameRate(fps),
    );
  }

  /** Frame rate used for cache keys: the track's own, else the timeline's. */
  private frameRate(fps: number): number {
    return this.reader?.nativeFps ?? fps;
  }

  private frameIndexAt(localSec: number, fps: number): number {
    return frameIndexForTime(
      localSec,
      this.reader?.firstTimestampSec ?? 0,
      this.frameRate(fps),
    );
  }

  /**
   * Idle pre-decode around `localSec` (M22/M23): fills the frame cache with
   * the neighbours `[τ − r, τ + r]` in ONE sequential decode pass — a single
   * keyframe rollback, then ~1 ms per frame — so a paused scrub turns nearby
   * frames into hits. `shouldContinue` is checked before every frame, so a new
   * τ or playback aborts the sweep within one frame.
   */
  async predecodeAround(
    localSec: number,
    fps: number,
    shouldContinue: () => boolean,
  ): Promise<void> {
    if (!this.element || !this.reader) return;
    const rate = this.frameRate(fps);
    if (!(rate > 0)) return;
    const firstTimestampSec = this.reader.firstTimestampSec;
    const center = this.frameIndexAt(localSec, fps);
    const lastIndex = this.lastFrameIndex(rate);
    const radius = Math.max(1, Math.floor(this.frameCacheLimit / 2) - 1);
    const first = Math.max(0, center - radius);
    const last = Math.min(lastIndex, center + radius);
    let missing = false;
    for (let i = first; i <= last && !missing; i++) {
      missing = !this.cacheHas(i);
    }
    if (!missing) return;
    await this.reader.framesInRange(
      timeForFrameIndex(first, firstTimestampSec, rate),
      timeForFrameIndex(last + 0.5, firstTimestampSec, rate),
      (frame, timestampSec) => {
        try {
          const i = frameIndexForTime(timestampSec, firstTimestampSec, rate);
          if (i < first || i > last || this.cacheHas(i)) return;
          this.cacheInsert(
            i,
            createImageTexture(this.device, frame, {
              width: this.width,
              height: this.height,
            }),
          );
        } finally {
          frame.close();
        }
      },
      () => shouldContinue() && !this.disposed,
    );
  }

  /** Publishes the prepared frame: flips to the cached texture on a hit, else
   * uploads the element's presented frame into the base texture. */
  presentCurrent(): void {
    if (this.pendingCached) {
      this.currentSlot = this.pendingCached.slot;
      this.currentIndex = this.pendingIndex;
      this.currentIsProxy = this.pendingIsProxy;
      this.setPending(null, null, false);
      return;
    }
    this.uploadCurrent();
    this.currentSlot = this._slot;
    this.currentIndex = null;
    this.currentIsProxy = false;
  }

  /** Starts native element playback. False lets the engine select its
   * frame-exact decode fallback when browser autoplay/privacy policy rejects
   * detached media playback. */
  async play(): Promise<boolean> {
    this.reader?.closeScrubCursor();
    if (!this.element) return false;
    try {
      await this.element.play();
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    this.element?.pause();
  }

  /** True while the element drifts more than `maxDriftSec` from `localSec`. */
  driftsFrom(localSec: number, maxDriftSec: number): boolean {
    if (!this.element) return false;
    return Math.abs(this.element.currentTime - localSec) > maxDriftSec;
  }

  dispose(): void {
    this.disposed = true;
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute("src");
      this.element.load();
    }
    this.reader?.dispose();
    this.reader = null;
    for (const entry of this.frameCache) entry.texture.destroy();
    this.frameCache.length = 0;
    for (const entry of this.proxyFrames.values()) entry.texture.destroy();
    this.proxyFrames.clear();
    this.setPending(null, null, false);
    this.texture.destroy();
  }

  private cacheHas(frameIndex: number): boolean {
    return this.frameCache.some((entry) => entry.frameIndex === frameIndex);
  }

  private cacheGet(frameIndex: number): CachedFrame | null {
    const index = this.frameCache.findIndex(
      (entry) => entry.frameIndex === frameIndex,
    );
    if (index < 0) return null;
    const [entry] = this.frameCache.splice(index, 1);
    this.frameCache.push(entry);
    return entry;
  }

  /** Uploads the decoded frame into a cached texture (closing the frame). */
  private cachePut(frameIndex: number, frame: VideoFrame): CachedFrame {
    let texture: GPUTexture;
    try {
      texture = createImageTexture(this.device, frame, {
        width: this.width,
        height: this.height,
      });
    } finally {
      frame.close();
    }
    return this.cacheInsert(frameIndex, texture);
  }

  /** Registers an uploaded texture under `frameIndex`, evicting LRU entries. */
  private cacheInsert(frameIndex: number, texture: GPUTexture): CachedFrame {
    const entry: CachedFrame = {
      frameIndex,
      texture,
      slot: {
        view: texture.createView(),
        width: this.width,
        height: this.height,
      },
    };
    this.frameCache.push(entry);
    if (this.frameCache.length > this.frameCacheLimit) {
      let evicted = this.frameCache.shift();
      if (evicted && evicted.slot === this.currentSlot) {
        // Never destroy the texture viewports are sampling right now;
        // evict the next-oldest entry instead.
        const next = this.frameCache.shift();
        this.frameCache.unshift(evicted);
        evicted = next;
      }
      evicted?.texture.destroy();
    }
    return entry;
  }
}
