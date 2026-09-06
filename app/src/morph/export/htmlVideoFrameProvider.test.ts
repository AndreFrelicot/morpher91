import { beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlVideoFrameProvider } from "./FrameProvider";
import type { LoadedVideo } from "@/lib/video/loadVideo";

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

function fakeDevice(): GPUDevice {
  return {
    createTexture: () => ({
      createView: () => ({}),
      destroy: vi.fn(),
    }),
    queue: { copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice;
}

function video(id: string): LoadedVideo {
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
    poster: {
      asset: {} as never,
      bitmap: { width: 64, height: 64 } as ImageBitmap,
    },
  };
}

function element(): HTMLVideoElement {
  return {
    currentTime: 0,
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  } as unknown as HTMLVideoElement;
}

describe("HtmlVideoFrameProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    media.elements = [element(), element()];
    media.seekVideoElement.mockImplementation(async (el, timeSec) => {
      el.currentTime = timeSec;
    });
    media.openReader.mockResolvedValue(null);
  });

  it("checks the real media time on every exported frame", async () => {
    const sourceElement = media.elements[0];
    const provider = new HtmlVideoFrameProvider(
      fakeDevice(),
      { bitmap: { width: 64, height: 64 } as ImageBitmap, video: video("a") },
      { bitmap: { width: 64, height: 64 } as ImageBitmap, video: video("b") },
    );

    await provider.frameAt(0.25, { sourceTimeSec: 1, targetTimeSec: 1 });
    sourceElement.currentTime = 2;
    await provider.frameAt(0.25, { sourceTimeSec: 1, targetTimeSec: 1 });

    expect(media.seekVideoElement).toHaveBeenCalledTimes(4);
    expect(media.seekVideoElement).toHaveBeenNthCalledWith(3, sourceElement, 1);
  });

  it("decodes through a sequential WebCodecs cursor, closing each frame", async () => {
    const frames: { close: ReturnType<typeof vi.fn> }[] = [];
    const next = vi.fn(async (timeSec: number) => {
      const frame = { close: vi.fn(), timeSec };
      frames.push(frame);
      return frame;
    });
    const closeCursor = vi.fn();
    const frameAt = vi.fn();
    const dispose = vi.fn();
    media.openReader.mockResolvedValue({
      frameAt,
      dispose,
      openSequence: () => ({ next, close: closeCursor }),
    });

    const provider = await HtmlVideoFrameProvider.createWithWebCodecs(
      fakeDevice(),
      { bitmap: { width: 64, height: 64 } as ImageBitmap, video: video("a") },
      { bitmap: { width: 64, height: 64 } as ImageBitmap, video: video("b") },
    );
    await provider.frameAt(0.25, { sourceTimeSec: 1, targetTimeSec: 2 });
    await provider.frameAt(0.5, { sourceTimeSec: 1.5, targetTimeSec: 2.5 });

    // Both sides stream frame-exactly in time order; no random-access seek
    // (reader.frameAt) and no <video> seek happens.
    expect(next.mock.calls.map(([t]) => t)).toEqual([1, 2, 1.5, 2.5]);
    expect(frameAt).not.toHaveBeenCalled();
    expect(media.seekVideoElement).not.toHaveBeenCalled();
    for (const frame of frames) expect(frame.close).toHaveBeenCalledTimes(1);

    provider.dispose();
    expect(closeCursor).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("keeps the <video> fallback when WebCodecs cannot open the source", async () => {
    media.openReader.mockResolvedValue(null);
    const provider = await HtmlVideoFrameProvider.createWithWebCodecs(
      fakeDevice(),
      { bitmap: { width: 64, height: 64 } as ImageBitmap, video: video("a") },
      { bitmap: { width: 64, height: 64 } as ImageBitmap, video: video("b") },
    );
    await provider.frameAt(0.25, { sourceTimeSec: 1, targetTimeSec: 2 });
    expect(media.seekVideoElement).toHaveBeenCalledTimes(2);
  });
});
