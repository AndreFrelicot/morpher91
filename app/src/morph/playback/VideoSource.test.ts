import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoSource } from "./VideoSource";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import { defaultPlacement } from "@/morph/model";

const media = vi.hoisted(() => ({
  createVideoElementForUrl: vi.fn(),
  seekVideoElement: vi.fn(),
  openReader: vi.fn(),
}));

vi.mock("@/lib/video/loadVideo", () => media);
vi.mock("@/lib/video/WebCodecsVideoReader", () => ({
  WebCodecsVideoReader: { open: media.openReader },
}));
vi.mock("@/lib/gpu/constrainedProfile", () => ({
  matchesConstrainedGpuProfile: () => false,
}));

const proxy = vi.hoisted(() => ({
  blit: vi.fn(),
  createTarget: vi.fn(),
}));

vi.mock("./proxyBlit", () => ({
  ProxyBlitter: class {
    createTarget = proxy.createTarget;
    blit = proxy.blit;
  },
}));

function fakeDevice(): GPUDevice & { createTexture: ReturnType<typeof vi.fn> } {
  return {
    createTexture: vi.fn(() => ({
      createView: () => ({}),
      destroy: vi.fn(),
    })),
    queue: { copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice & { createTexture: ReturnType<typeof vi.fn> };
}

function fakeElement(): HTMLVideoElement {
  return {
    currentTime: 0,
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  } as unknown as HTMLVideoElement;
}

/** 24 fps reader stub whose sweep hands over one closable frame per timestamp. */
function fakeReader(timestamps: number[]) {
  const closed: number[] = [];
  const reader = {
    closed,
    nativeFps: 24 as number | null,
    firstTimestampSec: 0,
    frameAt: vi.fn(async (timeSec: number) => ({
      close: () => closed.push(timeSec),
    })),
    framesInRange: vi.fn(
      async (
        _start: number,
        _end: number,
        onFrame: (frame: VideoFrame, timestampSec: number) => void,
        shouldContinue: () => boolean,
      ) => {
        for (const timestamp of timestamps) {
          if (!shouldContinue()) return;
          onFrame(
            { close: () => closed.push(timestamp) } as unknown as VideoFrame,
            timestamp,
          );
        }
      },
    ),
    dispose: vi.fn(),
  };
  return reader;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function loadedVideo(element: HTMLVideoElement): LoadedVideo {
  return {
    asset: {
      id: "video-a",
      name: "a.mp4",
      width: 640,
      height: 360,
      durationSec: 4,
      source: { kind: "object-url", value: "blob:a" },
      timeline: { startSec: 0, inSec: 0, durationSec: 4 },
    },
    element,
    objectUrl: "blob:a",
    poster: {
      asset: {
        id: "poster-a",
        name: "a.mp4",
        width: 640,
        height: 360,
        source: { kind: "object-url", value: "blob:a" },
        placement: defaultPlacement(),
      },
      bitmap: { width: 640, height: 360 } as ImageBitmap,
    },
  };
}

describe("VideoSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.openReader.mockResolvedValue(null);
    proxy.createTarget.mockImplementation(() => ({
      createView: () => ({}),
      destroy: vi.fn(),
    }));
  });

  it("seeks again when native playback moved away from a previously requested time", async () => {
    const element = {
      currentTime: 0,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLVideoElement;
    media.createVideoElementForUrl.mockReturnValue(element);
    media.seekVideoElement.mockImplementation(async (video, timeSec) => {
      video.currentTime = timeSec;
    });
    const source = new VideoSource(fakeDevice(), {
      bitmap: { width: 640, height: 360 } as ImageBitmap,
      video: loadedVideo(element),
    });

    await source.seekTo(1);
    element.currentTime = 2;
    await source.seekTo(1);

    expect(media.seekVideoElement).toHaveBeenCalledTimes(2);
    expect(element.currentTime).toBe(1);
  });

  it("measures drift from the element's current time", () => {
    const element = {
      currentTime: 1.2,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLVideoElement;
    media.createVideoElementForUrl.mockReturnValue(element);
    const source = new VideoSource(fakeDevice(), {
      bitmap: { width: 640, height: 360 } as ImageBitmap,
      video: loadedVideo(element),
    });

    expect(source.driftsFrom(1, 0.05)).toBe(true);
    element.currentTime = 1.02;
    expect(source.driftsFrom(1, 0.05)).toBe(false);
  });

  describe("scrub cache keyed on the source frame rate (M23)", () => {
    it("shares one decode between timeline frames that show the same source frame", async () => {
      // 24 fps clip scrubbed at 30 fps: τ = 0 and τ = 1/30 both show frame 0.
      const reader = fakeReader([]);
      media.openReader.mockResolvedValue(reader);
      const element = fakeElement();
      media.createVideoElementForUrl.mockReturnValue(element);
      const source = new VideoSource(fakeDevice(), {
        bitmap: { width: 640, height: 360 } as ImageBitmap,
        video: loadedVideo(element),
      });
      await flush();

      await source.prepareScrubFrame(0, 30);
      source.presentCurrent();
      await source.prepareScrubFrame(1 / 30, 30);
      source.presentCurrent();
      expect(reader.frameAt).toHaveBeenCalledTimes(1);

      await source.prepareScrubFrame(2 / 30, 30); // source frame 1
      expect(reader.frameAt).toHaveBeenCalledTimes(2);
      expect(reader.frameAt).toHaveBeenLastCalledWith(2 / 30);
      expect(media.seekVideoElement).not.toHaveBeenCalled();
    });
  });

  describe("whole-clip proxy tier (M23)", () => {
    /** 5-frame clip at 24 fps: frames 0..4. */
    function fiveFrameSource(reader: ReturnType<typeof fakeReader>) {
      media.openReader.mockResolvedValue(reader);
      const element = fakeElement();
      media.createVideoElementForUrl.mockReturnValue(element);
      const base = loadedVideo(element);
      return new VideoSource(fakeDevice(), {
        bitmap: { width: 640, height: 360 } as ImageBitmap,
        video: { ...base, asset: { ...base.asset, durationSec: 5 / 24 } },
      });
    }

    it("sweeps the clip into reduced textures and resumes where it stopped", async () => {
      const timestamps = [0, 1, 2, 3, 4].map((i) => i / 24);
      const reader = fakeReader(timestamps);
      const source = fiveFrameSource(reader);
      await flush();

      let blits = 0;
      proxy.blit.mockImplementation(() => {
        blits++;
      });
      await source.sweepProxy(() => blits < 2);
      expect(source.proxyFrameCount).toBe(2);
      expect(proxy.createTarget).toHaveBeenCalledWith(320, 180);
      expect(reader.closed).toEqual([0, 1 / 24]);

      await source.sweepProxy(() => true);
      const [resumeStart, resumeEnd] = reader.framesInRange.mock.calls[1];
      expect(resumeStart).toBeCloseTo(2 / 24, 9);
      expect(resumeEnd).toBeCloseTo(5 / 24, 9);
      expect(source.proxyFrameCount).toBe(5);

      // Complete: further idle passes never touch the decoder again.
      await source.sweepProxy(() => true);
      expect(reader.framesInRange).toHaveBeenCalledTimes(2);
    });

    it("presents the proxy frame at once on a miss, then upgrades it in idle", async () => {
      const reader = fakeReader([0, 1, 2, 3, 4].map((i) => i / 24));
      const source = fiveFrameSource(reader);
      await flush();
      await source.sweepProxy(() => true);

      await source.prepareScrubFrame(3 / 24, 30);
      source.presentCurrent();
      expect(reader.frameAt).not.toHaveBeenCalled();
      expect(source.slot.width).toBe(320);

      await expect(source.ensureFullResCurrent(30, () => true)).resolves.toBe(
        true,
      );
      expect(reader.frameAt).toHaveBeenCalledTimes(1);
      expect(reader.frameAt.mock.calls[0][0]).toBeCloseTo(3 / 24, 9);
      expect(source.slot.width).toBe(640);

      // Nothing to upgrade any more.
      await expect(source.ensureFullResCurrent(30, () => true)).resolves.toBe(
        false,
      );
    });

    it("keeps the proxy when the upgrade is cancelled and closes the frame", async () => {
      const reader = fakeReader([0, 1, 2, 3, 4].map((i) => i / 24));
      const source = fiveFrameSource(reader);
      await flush();
      await source.sweepProxy(() => true);
      await source.prepareScrubFrame(1 / 24, 30);
      source.presentCurrent();

      await expect(source.ensureFullResCurrent(30, () => false)).resolves.toBe(
        false,
      );
      expect(source.slot.width).toBe(320);
      expect(reader.closed).toContain(1 / 24);
    });

    it("skips the proxy when the frame rate is unknown", async () => {
      const reader = { ...fakeReader([0]), nativeFps: null };
      const source = fiveFrameSource(reader);
      await flush();
      await source.sweepProxy(() => true);
      expect(reader.framesInRange).not.toHaveBeenCalled();
      expect(source.proxyFrameCount).toBe(0);
    });

    it("skips the proxy when no scale fits the budget", async () => {
      const reader = fakeReader([0]);
      media.openReader.mockResolvedValue(reader);
      const element = fakeElement();
      media.createVideoElementForUrl.mockReturnValue(element);
      const base = loadedVideo(element);
      const source = new VideoSource(fakeDevice(), {
        bitmap: { width: 8000, height: 8000 } as ImageBitmap,
        video: {
          ...base,
          asset: { ...base.asset, width: 8000, height: 8000, durationSec: 60 },
        },
      });
      await flush();
      await source.sweepProxy(() => true);
      expect(reader.framesInRange).not.toHaveBeenCalled();
    });
  });

  describe("predecodeAround (M23 sequential sweep)", () => {
    it("decodes the neighbourhood in one pass, one texture per source frame", async () => {
      const reader = fakeReader([0, 1 / 24, 2 / 24]);
      media.openReader.mockResolvedValue(reader);
      const element = fakeElement();
      media.createVideoElementForUrl.mockReturnValue(element);
      const device = fakeDevice();
      const source = new VideoSource(device, {
        bitmap: { width: 640, height: 360 } as ImageBitmap,
        video: loadedVideo(element),
      });
      await flush();
      device.createTexture.mockClear();

      await source.predecodeAround(0, 30, () => true);

      expect(reader.framesInRange).toHaveBeenCalledTimes(1);
      expect(reader.frameAt).not.toHaveBeenCalled();
      const [startSec, endSec] = reader.framesInRange.mock.calls[0];
      expect(startSec).toBe(0);
      // Radius 23 source frames at the clip's own 24 fps, not the timeline's.
      expect(endSec).toBeCloseTo(23.5 / 24, 6);
      expect(device.createTexture).toHaveBeenCalledTimes(3);
      expect(reader.closed).toEqual([0, 1 / 24, 2 / 24]);
    });

    it("skips indices already in the cache and does nothing when all are cached", async () => {
      const reader = fakeReader([0, 1 / 24, 2 / 24]);
      media.openReader.mockResolvedValue(reader);
      const element = fakeElement();
      media.createVideoElementForUrl.mockReturnValue(element);
      const device = fakeDevice();
      const source = new VideoSource(device, {
        bitmap: { width: 640, height: 360 } as ImageBitmap,
        video: loadedVideo(element),
      });
      await flush();
      await source.prepareScrubFrame(1 / 24, 30); // frame 1 cached via frameAt
      source.presentCurrent();
      device.createTexture.mockClear();

      await source.predecodeAround(0, 30, () => true);
      expect(device.createTexture).toHaveBeenCalledTimes(2); // frames 0 and 2

      // Everything the stub can deliver is now cached for a 1-frame clip…
      const short = fakeReader([0]);
      media.openReader.mockResolvedValue(short);
      const tiny = new VideoSource(fakeDevice(), {
        bitmap: { width: 640, height: 360 } as ImageBitmap,
        video: {
          ...loadedVideo(element),
          asset: { ...loadedVideo(element).asset, durationSec: 0 },
        },
      });
      await flush();
      await tiny.predecodeAround(0, 30, () => true);
      expect(short.framesInRange).toHaveBeenCalledTimes(1);
      await tiny.predecodeAround(0, 30, () => true);
      // …so the second pass finds no missing index and never touches the decoder.
      expect(short.framesInRange).toHaveBeenCalledTimes(1);
    });

    it("stops the sweep as soon as shouldContinue turns false", async () => {
      const reader = fakeReader([0, 1 / 24]);
      media.openReader.mockResolvedValue(reader);
      const element = fakeElement();
      media.createVideoElementForUrl.mockReturnValue(element);
      const device = fakeDevice();
      const source = new VideoSource(device, {
        bitmap: { width: 640, height: 360 } as ImageBitmap,
        video: loadedVideo(element),
      });
      await flush();
      device.createTexture.mockClear();

      let delivered = 0;
      device.createTexture.mockImplementation(() => {
        delivered++;
        return { createView: () => ({}), destroy: vi.fn() };
      });
      await source.predecodeAround(0, 30, () => delivered < 1);

      expect(device.createTexture).toHaveBeenCalledTimes(1);
    });
  });
});
