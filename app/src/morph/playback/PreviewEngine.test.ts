import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import { PreviewEngine } from "./PreviewEngine";

const media = vi.hoisted(() => ({
  elements: [] as HTMLVideoElement[],
  seekVideoElement: vi.fn(),
  openReader: vi.fn(),
}));

vi.mock("@/lib/video/loadVideo", () => ({
  createVideoElementForUrl: vi.fn(() => media.elements.shift()),
  seekVideoElement: media.seekVideoElement,
}));

vi.mock("@/lib/video/WebCodecsVideoReader", () => ({
  WebCodecsVideoReader: { open: media.openReader },
}));

vi.mock("./proxyBlit", () => ({
  ProxyBlitter: class {
    createTarget = () => ({ createView: () => ({}), destroy: vi.fn() });
    blit = vi.fn();
  },
}));

function image(id: string): ImageAsset {
  return {
    id,
    name: `${id}.png`,
    width: 64,
    height: 64,
    source: { kind: "bundled", value: id },
    placement: defaultPlacement(),
  };
}

function element(): HTMLVideoElement {
  return {
    currentTime: 0,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  } as unknown as HTMLVideoElement;
}

function loadedVideo(id: string): LoadedVideo {
  return {
    asset: {
      id,
      name: `${id}.mp4`,
      width: 64,
      height: 64,
      durationSec: 4,
      source: { kind: "object-url", value: `blob:${id}` },
      timeline: { startSec: 0, inSec: 0, durationSec: 4 },
    },
    element: {} as HTMLVideoElement,
    objectUrl: `blob:${id}`,
    poster: { asset: image(`${id}-poster`), bitmap: {} as ImageBitmap },
  };
}

type ClosableTestFrame = { close: ReturnType<typeof vi.fn> };

function deferredPlaybackReader(
  pendingFrames: Array<() => void>,
  decodedFrames: ClosableTestFrame[] = [],
) {
  return {
    nativeFps: 24,
    firstTimestampSec: 0,
    scrubFrameAt: vi.fn(
      () =>
        new Promise<VideoFrame>((resolve) => {
          const frame = { close: vi.fn() };
          decodedFrames.push(frame);
          pendingFrames.push(() => resolve(frame as unknown as VideoFrame));
        }),
    ),
    closeScrubCursor: vi.fn(),
    frameAt: vi.fn(async () => null),
    framesInRange: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
}

function createEngine() {
  const copyExternalImageToTexture = vi.fn();
  const device = {
    createTexture: () => ({
      createView: () => ({}),
      destroy: vi.fn(),
    }),
    queue: { copyExternalImageToTexture },
  } as unknown as GPUDevice;
  const project = createProject(image("a"), image("b"));
  const sourceVideo = loadedVideo("a");
  const targetVideo = loadedVideo("b");
  project.videos = { source: sourceVideo.asset, target: targetVideo.asset };
  return {
    project,
    preview: new PreviewEngine(
      device,
      { bitmap: {} as ImageBitmap, video: sourceVideo },
      { bitmap: {} as ImageBitmap, video: targetVideo },
      project,
    ),
    copyExternalImageToTexture,
  };
}

describe("PreviewEngine", () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextRaf: number;

  beforeEach(() => {
    media.elements = [element(), element()];
    media.openReader.mockReset().mockResolvedValue(null);
    media.seekVideoElement.mockReset();
    media.seekVideoElement.mockImplementation(async (video, timeSec) => {
      video.currentTime = timeSec;
    });
    callbacks = new Map();
    nextRaf = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextRaf++;
      callbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      callbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps exactly one RAF clock across ten play calls and invalidates it on pause", () => {
    const { preview } = createEngine();
    const onTau = vi.fn();

    preview.play(0, onTau);
    const stale = [...callbacks.values()][0];
    expect(callbacks).toHaveLength(1);

    for (let index = 1; index < 10; index++) preview.play(index, onTau);
    expect(callbacks).toHaveLength(1);

    stale(performance.now() + 16);
    expect(callbacks).toHaveLength(1);

    const activeAtPause = [...callbacks.values()][0];
    preview.pause();
    activeAtPause(performance.now() + 32);
    expect(callbacks).toHaveLength(0);
    expect(onTau).not.toHaveBeenCalled();
  });

  it("seeks new source/target local frames at a stationary playhead after clip edits", async () => {
    const [sourceElement, targetElement] = media.elements;
    const { preview, project } = createEngine();
    await preview.sync(2);
    expect(sourceElement.currentTime).toBe(2);
    expect(targetElement.currentTime).toBe(2);

    preview.setProject({
      ...project,
      videos: {
        source: {
          ...project.videos!.source!,
          timeline: { startSec: 1, inSec: 0, durationSec: 3 },
        },
        target: {
          ...project.videos!.target!,
          timeline: { startSec: 0, inSec: 1, durationSec: 3 },
        },
      },
    });
    await preview.sync(2);
    expect(sourceElement.currentTime).toBe(1);
    expect(targetElement.currentTime).toBe(3);
    // A left trim changes start and in together: an interior frame stays put.
    preview.setProject({
      ...project,
      videos: {
        source: {
          ...project.videos!.source!,
          timeline: { startSec: 1.5, inSec: 0.5, durationSec: 2.5 },
        },
        target: {
          ...project.videos!.target!,
          timeline: { startSec: 0, inSec: 1, durationSec: 3 },
        },
      },
    });
    await preview.sync(2);
    expect(sourceElement.currentTime).toBe(1);
    expect(targetElement.currentTime).toBe(3);
    preview.dispose();
  });

  it("pre-decodes the source side before the target side (shared decoder)", async () => {
    const order: string[] = [];
    media.openReader.mockImplementation(async (url: string) => ({
      frameAt: vi.fn(async () => null),
      framesInRange: vi.fn(async () => {
        order.push(url);
      }),
      dispose: vi.fn(),
    }));
    const { preview } = createEngine();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await preview.predecodeAround(0, () => true);

    expect(order).toEqual(["blob:a", "blob:b"]);
  });

  it("presents both videos at full resolution without a later proxy upgrade", async () => {
    // Frames 48..51 (τ = 2 s at 24 fps) are outside the neighbourhood
    // of τ = 0. With proxies disabled, this seek must decode both sides.
    const frameTimes = [48, 49, 50, 51].map((i) => i / 24);
    const readers = new Map<string, { frameAt: ReturnType<typeof vi.fn> }>();
    media.openReader.mockImplementation(async (url: string) => {
      const reader = {
        nativeFps: 24,
        firstTimestampSec: 0,
        frameAt: vi.fn(async () => ({ close: vi.fn() })),
        framesInRange: vi.fn(
          async (
            start: number,
            end: number,
            onFrame: (frame: VideoFrame, timestampSec: number) => void,
            shouldContinue: () => boolean,
          ) => {
            for (const t of frameTimes) {
              if (t < start || t >= end || !shouldContinue()) continue;
              onFrame({ close: vi.fn() } as unknown as VideoFrame, t);
            }
          },
        ),
        dispose: vi.fn(),
      };
      readers.set(url, reader);
      return {
        ...reader,
        scrubFrameAt: reader.frameAt,
        closeScrubCursor: vi.fn(),
      };
    });
    const { preview } = createEngine();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const emitted: number[] = [];
    preview.subscribe((frame) => emitted.push(frame.tauSec));

    // Idle pass at τ = 0 does not preload the requested distant frames.
    await preview.predecodeAround(0, () => true);
    expect(emitted).toEqual([]);

    // Scrub to τ = 2 s: publish only after both native frames are available.
    await preview.sync(2);
    expect(readers.get("blob:a")?.frameAt).toHaveBeenCalledTimes(1);
    expect(readers.get("blob:b")?.frameAt).toHaveBeenCalledTimes(1);
    expect(preview.slots().a.width).toBe(64);
    expect(preview.slots().b.width).toBe(64);
    expect(emitted).toEqual([2]);

    // Idle work does not need to decode or publish a sharper replacement.
    await preview.predecodeAround(2, () => true);
    expect(readers.get("blob:a")?.frameAt).toHaveBeenCalledTimes(1);
    expect(readers.get("blob:b")?.frameAt).toHaveBeenCalledTimes(1);
    expect(preview.slots().a.width).toBe(64);
    expect(emitted).toEqual([2]);
    preview.dispose();
  });

  it("publishes only the latest sync when an older seek finishes late", async () => {
    const { preview, copyExternalImageToTexture } = createEngine();
    const frames: number[] = [];
    preview.subscribe((frame) => frames.push(frame.tauSec));

    let finishFirstSeek = () => {};
    let markFirstSeekStarted = () => {};
    const firstSeekStarted = new Promise<void>((resolve) => {
      markFirstSeekStarted = resolve;
    });
    media.seekVideoElement.mockImplementationOnce(() => {
      markFirstSeekStarted();
      return new Promise<void>((resolve) => {
        finishFirstSeek = resolve;
      });
    });

    const first = preview.sync(1);
    await firstSeekStarted;
    const second = preview.sync(2);
    finishFirstSeek();
    await Promise.all([first, second]);

    expect(frames).toEqual([2]);
    expect(copyExternalImageToTexture).toHaveBeenCalledTimes(4);
  });

  it("presents a completed realtime correction when a newer RAF tick is queued", async () => {
    const { preview } = createEngine();
    const frames: number[] = [];
    preview.subscribe((frame) => frames.push(frame.tauSec));

    const pendingSeeks: Array<() => void> = [];
    let markCorrectionStarted = () => {};
    const correctionStarted = new Promise<void>((resolve) => {
      markCorrectionStarted = resolve;
    });
    media.seekVideoElement.mockImplementation((video, timeSec) => {
      return new Promise<void>((resolve) => {
        pendingSeeks.push(() => {
          video.currentTime = timeSec;
          resolve();
        });
        if (pendingSeeks.length === 2) markCorrectionStarted();
      });
    });

    const startedAt = performance.now();
    preview.play(0, vi.fn());
    const [firstId, firstTick] = [...callbacks.entries()][0];
    callbacks.delete(firstId);
    firstTick(startedAt + 100);
    await correctionStarted;

    // Zen can require corrective seeks because detached muted videos do not
    // always advance natively. A following RAF must not discard the decoded
    // frame that is already about to be presented.
    const [secondId, secondTick] = [...callbacks.entries()].at(-1)!;
    callbacks.delete(secondId);
    secondTick(startedAt + 200);
    pendingSeeks.slice(0, 2).forEach((finish) => finish());

    await vi.waitFor(() => expect(frames).toHaveLength(1));
    expect(frames[0]).toBeGreaterThan(0.05);
    expect(frames[0]).toBeLessThan(0.15);
    preview.pause();
  });

  it("keeps latest-wins playback when native video advances without correction", async () => {
    const deferredPlays: Array<() => void> = [];
    for (const video of media.elements) {
      vi.mocked(video.play)
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              deferredPlays.push(resolve);
            }),
        )
        .mockResolvedValue(undefined);
    }
    const { preview } = createEngine();
    const frames: number[] = [];
    preview.subscribe((frame) => frames.push(frame.tauSec));

    const startedAt = performance.now();
    preview.play(0, vi.fn());
    const [firstId, firstTick] = [...callbacks.entries()][0];
    callbacks.delete(firstId);
    firstTick(startedAt + 10);
    await vi.waitFor(() => expect(deferredPlays).toHaveLength(2));

    const [secondId, secondTick] = [...callbacks.entries()].at(-1)!;
    callbacks.delete(secondId);
    secondTick(startedAt + 20);
    deferredPlays.forEach((finish) => finish());

    await vi.waitFor(() => expect(frames).toHaveLength(1));
    expect(frames[0]).toBeGreaterThan(0.01);
    expect(frames[0]).toBeLessThan(0.03);
    expect(media.seekVideoElement).not.toHaveBeenCalled();
    preview.pause();
  });

  it("falls back to frame-exact decoding when native playback is rejected", async () => {
    const pendingFrames: Array<() => void> = [];
    const readers: Array<ReturnType<typeof deferredPlaybackReader>> = [];
    media.openReader.mockImplementation(async () => {
      const reader = deferredPlaybackReader(pendingFrames);
      readers.push(reader);
      return reader;
    });
    for (const video of media.elements) {
      vi.mocked(video.play).mockRejectedValue(
        new DOMException("Autoplay is blocked", "NotAllowedError"),
      );
    }
    const { preview } = createEngine();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const frames: number[] = [];
    preview.subscribe((frame) => {
      frames.push(frame.tauSec);
      preview.pause();
    });

    const startedAt = performance.now();
    preview.play(0, vi.fn());
    const [firstId, firstTick] = [...callbacks.entries()][0];
    callbacks.delete(firstId);
    firstTick(startedAt + 10);
    await vi.waitFor(() => expect(pendingFrames).toHaveLength(2));

    // Queue a newer RAF while both fallback decodes are in flight. The
    // completed frame must still be presented instead of being starved by the
    // continuously advancing playback generation.
    const [secondId, secondTick] = [...callbacks.entries()].at(-1)!;
    callbacks.delete(secondId);
    secondTick(startedAt + 20);
    pendingFrames.forEach((finish) => finish());

    await vi.waitFor(() => expect(frames).toHaveLength(1));
    expect(frames[0]).toBeGreaterThan(0);
    expect(frames[0]).toBeLessThan(0.02);
    expect(readers).toHaveLength(2);
    expect(readers[0].scrubFrameAt).toHaveBeenCalledTimes(1);
    expect(readers[1].scrubFrameAt).toHaveBeenCalledTimes(1);
  });

  it("discards an in-flight fallback frame after playback is paused", async () => {
    const decodedFrames: ClosableTestFrame[] = [];
    const pendingFrames: Array<() => void> = [];
    media.openReader.mockImplementation(async () =>
      deferredPlaybackReader(pendingFrames, decodedFrames),
    );
    for (const video of media.elements) {
      vi.mocked(video.play).mockRejectedValue(
        new DOMException("Autoplay is blocked", "NotAllowedError"),
      );
    }
    const { preview } = createEngine();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const frames: number[] = [];
    preview.subscribe((frame) => frames.push(frame.tauSec));

    const startedAt = performance.now();
    preview.play(0, vi.fn());
    const [firstId, firstTick] = [...callbacks.entries()][0];
    callbacks.delete(firstId);
    firstTick(startedAt + 10);
    await vi.waitFor(() => expect(pendingFrames).toHaveLength(2));
    preview.pause();
    pendingFrames.forEach((finish) => finish());

    await vi.waitFor(() =>
      expect(
        decodedFrames.every((frame) => frame.close.mock.calls.length === 1),
      ).toBe(true),
    );
    expect(frames).toEqual([]);
  });
});
