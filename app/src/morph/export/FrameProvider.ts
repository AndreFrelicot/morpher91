import type { GpuImageSlot } from "@/morph/algorithms/MorphBackend";
import {
  createImageTexture,
  uploadExternalImageToTexture,
} from "@/morph/gpu/textures";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import {
  createVideoElementForUrl,
  seekVideoElement,
} from "@/lib/video/loadVideo";
import {
  WebCodecsVideoReader,
  type SequentialFrameCursor,
} from "@/lib/video/WebCodecsVideoReader";

/** The two source/target slots a backend samples at one timeline position. */
export type FramePair = { a: GpuImageSlot; b: GpuImageSlot };

export type FrameProviderTiming = {
  tauSec?: number;
  sourceTimeSec?: number;
  targetTimeSec?: number;
};

/**
 * Source of the A/B GPU textures at a given timeline position `t` (PRD §29.4).
 *
 * The only "video" foresight taken in v1: it isolates "what are the textures of
 * A and B at instant t" from the export loop and the backends. v1 is a static
 * bitmap provider (same textures for every t). v2 plugs a `VideoFrame` provider
 * that seeks `video.currentTime` and uploads the decoded frame — without
 * touching the backends or the export loop.
 */
export interface FrameProvider {
  /** Slots for A and B at timeline position `t` (0..1). */
  frameAt(
    t: number,
    timing?: FrameProviderTiming,
  ): FramePair | Promise<FramePair>;
  /** Releases owned GPU textures. */
  dispose(): void;
}

/**
 * v1 provider: uploads both bitmaps to textures once and returns the same slots
 * regardless of `t`. The morph over time comes entirely from the backend's warp
 * + dissolve, not from the frame source.
 */
export class StaticBitmapFrameProvider implements FrameProvider {
  private readonly texA: GPUTexture;
  private readonly texB: GPUTexture;
  private readonly pair: FramePair;

  constructor(device: GPUDevice, source: ImageBitmap, target: ImageBitmap) {
    this.texA = createImageTexture(device, source);
    this.texB = createImageTexture(device, target);
    this.pair = {
      a: {
        view: this.texA.createView(),
        width: source.width,
        height: source.height,
      },
      b: {
        view: this.texB.createView(),
        width: target.width,
        height: target.height,
      },
    };
  }

  frameAt(): FramePair {
    return this.pair;
  }

  dispose(): void {
    this.texA.destroy();
    this.texB.destroy();
  }
}

type VideoFrameSource = {
  bitmap: ImageBitmap;
  video: LoadedVideo | null;
};

type DynamicSlot = {
  tex: GPUTexture;
  slot: GpuImageSlot;
  source: VideoFrameSource;
  element: HTMLVideoElement | null;
  reader: WebCodecsVideoReader | null;
  /** Sequential decode stream over `reader` (M23): export frames are
   * requested in time order, so each packet is decoded once. */
  cursor: SequentialFrameCursor | null;
};

export class HtmlVideoFrameProvider implements FrameProvider {
  private readonly device: GPUDevice;
  private readonly a: DynamicSlot;
  private readonly b: DynamicSlot;

  constructor(
    device: GPUDevice,
    source: VideoFrameSource,
    target: VideoFrameSource,
  ) {
    this.device = device;
    this.a = this.createSlot(source);
    this.b = this.createSlot(target);
  }

  /**
   * Preferred export path (M22): opens a WebCodecs reader per video side so
   * frames decode frame-exactly through VideoDecoder instead of `<video>`
   * seeks. A side whose codec (or WebCodecs) is unsupported keeps the element
   * path — behaviour and timing semantics are unchanged, only the decode is.
   */
  static async createWithWebCodecs(
    device: GPUDevice,
    source: VideoFrameSource,
    target: VideoFrameSource,
  ): Promise<HtmlVideoFrameProvider> {
    const provider = new HtmlVideoFrameProvider(device, source, target);
    const open = async (slot: DynamicSlot) => {
      if (!slot.source.video) return;
      slot.reader = await WebCodecsVideoReader.open(
        slot.source.video.objectUrl,
      );
      slot.cursor = slot.reader?.openSequence() ?? null;
    };
    await Promise.all([open(provider.a), open(provider.b)]);
    return provider;
  }

  async frameAt(
    _t: number,
    timing: FrameProviderTiming = {},
  ): Promise<FramePair> {
    await Promise.all([
      this.upload(this.a, timing.sourceTimeSec ?? timing.tauSec ?? 0),
      this.upload(this.b, timing.targetTimeSec ?? timing.tauSec ?? 0),
    ]);
    return { a: this.a.slot, b: this.b.slot };
  }

  dispose(): void {
    this.disposeSlot(this.a);
    this.disposeSlot(this.b);
  }

  private disposeSlot(slot: DynamicSlot): void {
    slot.element?.pause();
    slot.element?.removeAttribute("src");
    slot.element?.load();
    slot.cursor?.close();
    slot.cursor = null;
    slot.reader?.dispose();
    slot.reader = null;
    slot.tex.destroy();
  }

  private createSlot(source: VideoFrameSource): DynamicSlot {
    const width = source.video?.asset.width ?? source.bitmap.width;
    const height = source.video?.asset.height ?? source.bitmap.height;
    const tex = createImageTexture(this.device, source.bitmap, {
      width,
      height,
    });
    return {
      tex,
      source,
      element: source.video
        ? createVideoElementForUrl(source.video.objectUrl)
        : null,
      reader: null,
      cursor: null,
      slot: { view: tex.createView(), width, height },
    };
  }

  private async upload(slot: DynamicSlot, timeSec: number): Promise<void> {
    const video = slot.source.video;
    if (!video || !slot.element) {
      uploadExternalImageToTexture(this.device, slot.tex, slot.source.bitmap);
      return;
    }
    if (slot.cursor) {
      const frame = await slot.cursor.next(timeSec);
      if (frame) {
        try {
          uploadExternalImageToTexture(this.device, slot.tex, frame, {
            width: video.asset.width,
            height: video.asset.height,
          });
        } finally {
          frame.close();
        }
        return;
      }
      // Decode failure on this frame: fall back to the element seek below.
    }
    slot.element.pause();
    await seekVideoElement(slot.element, timeSec);
    uploadExternalImageToTexture(this.device, slot.tex, slot.element, {
      width: video.asset.width,
      height: video.asset.height,
    });
  }
}
