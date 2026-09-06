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

  it("serves a proxy frame instantly, then upgrades it and re-emits in idle", async () => {
    // Readers deliver frames 48..51 (τ = 2 s at 24 fps): outside the
    // neighbourhood of τ = 0, so only the whole-clip proxy sweep collects them.
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
      return reader;
    });
    const { preview } = createEngine();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const emitted: number[] = [];
    preview.subscribe((frame) => emitted.push(frame.tauSec));

    // Idle pass at τ = 0: nothing to upgrade, no neighbours, proxy sweep.
    await preview.predecodeAround(0, () => true);
    expect(emitted).toEqual([]);

    // Scrub to τ = 2 s: both sides are served from the proxy, no decode.
    await preview.sync(2);
    expect(readers.get("blob:a")?.frameAt).not.toHaveBeenCalled();
    expect(preview.slots().a.width).toBe(32); // 64 → half scale
    expect(emitted).toEqual([2]);

    // Idle pass: full-resolution upgrade of the presented frame + re-emit.
    await preview.predecodeAround(2, () => true);
    expect(readers.get("blob:a")?.frameAt).toHaveBeenCalledTimes(1);
    expect(readers.get("blob:b")?.frameAt).toHaveBeenCalledTimes(1);
    expect(preview.slots().a.width).toBe(64);
    expect(emitted).toEqual([2, 2]);
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
});
