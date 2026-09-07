import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import type { LoadedImage } from "@/lib/image/loadImage";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

const engine = vi.hoisted(() => ({
  sync: vi.fn<() => Promise<void>>(),
  play: vi.fn(),
  pause: vi.fn(),
  invalidatePendingSync: vi.fn(),
  predecodeAround: vi.fn<() => Promise<void>>(),
  setReaderReadyListener: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock("./previewEngineHost", () => ({
  ensurePreviewEngine: vi.fn(async () => {
    engine.setProject(useProjectStore.getState().project);
    return engine;
  }),
  getPreviewEngine: vi.fn(() => engine),
  disposePreviewEngine: vi.fn(),
}));

import { PREDECODE_IDLE_MS, startPreviewDriver } from "./previewDriver";

function image(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 64,
    height: 64,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
}

function loadedImage(name: string): LoadedImage {
  return { asset: image(name), bitmap: {} as ImageBitmap };
}

beforeAll(() => {
  startPreviewDriver();
});

beforeEach(async () => {
  engine.sync.mockReset().mockResolvedValue(undefined);
  engine.play.mockReset();
  engine.pause.mockReset();
  engine.invalidatePendingSync.mockReset();
  engine.predecodeAround.mockReset().mockResolvedValue(undefined);
  const source = loadedImage("source");
  const target = loadedImage("target");
  useProjectStore.setState({
    source,
    target,
    sourceVideo: null,
    targetVideo: null,
    project: createProject(source.asset, target.asset),
  });
  useEditorStore.getState().setPlaying(false);
  useEditorStore.getState().setTimelineTime(0, 4);
  await vi.waitFor(() => expect(engine.sync).toHaveBeenCalled());
  engine.sync.mockClear();
  engine.pause.mockClear();
  engine.invalidatePendingSync.mockClear();
});

describe("previewDriver", () => {
  it("pauses the active engine synchronously before restarting from a scrub", async () => {
    useEditorStore.getState().setPlaying(true);
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledOnce());

    let finishRestart = () => {};
    engine.sync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRestart = resolve;
        }),
    );
    engine.pause.mockClear();

    useEditorStore.getState().setTimelineTime(1, 4);

    expect(engine.pause).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledOnce());
    finishRestart();
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2));
  });

  it("finishes the active seek and coalesces pending requests to the final position", async () => {
    const { getPreviewSyncStatus } = await import("./previewSyncStatus");
    let finish!: () => void;
    engine.sync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    useEditorStore.getState().setTimelineTime(1, 4);
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledOnce());
    const started = getPreviewSyncStatus().pendingSince;
    useEditorStore.getState().setTimelineTime(2, 4);
    useEditorStore.getState().setTimelineTime(3, 4);
    expect(engine.invalidatePendingSync).not.toHaveBeenCalled();
    expect(getPreviewSyncStatus().pendingSince).toBe(started);
    finish();
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(2));
    expect(engine.sync).toHaveBeenLastCalledWith(3, { realtime: false });
    await vi.waitFor(() =>
      expect(getPreviewSyncStatus().pendingSince).toBeNull(),
    );
  });

  it("presents frames during a continuous gesture even when decoding is slower than pointer events", async () => {
    vi.useFakeTimers();
    try {
      const presented: number[] = [];
      engine.sync.mockImplementation((...args: unknown[]) => {
        const time = args[0] as number;
        const invalidations = engine.invalidatePendingSync.mock.calls.length;
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            if (
              engine.invalidatePendingSync.mock.calls.length === invalidations
            ) {
              presented.push(time);
            }
            resolve();
          }, 80);
        });
      });
      for (let step = 1; step <= 20; step++) {
        useEditorStore.getState().setTimelineTime(step / 10, 4);
        await vi.advanceTimersByTimeAsync(16);
      }
      // The gesture is still active: progress must not depend on pointerup.
      expect(presented.length).toBeGreaterThanOrEqual(3);
      expect(presented.at(-1)).toBeGreaterThan(presented[0]);
      await vi.advanceTimersByTimeAsync(160);
      expect(presented.at(-1)).toBe(2);
      expect(engine.sync.mock.calls.length).toBeLessThan(20);
    } finally {
      await vi.advanceTimersByTimeAsync(200);
      vi.useRealTimers();
    }
  });

  it("defers background decoding until the gesture settles and cancels it on playback", async () => {
    vi.useFakeTimers();
    try {
      engine.predecodeAround.mockClear();
      useEditorStore.getState().setTimelineTime(1, 4);
      await vi.advanceTimersByTimeAsync(PREDECODE_IDLE_MS - 1);
      expect(engine.predecodeAround).not.toHaveBeenCalled();
      useEditorStore.getState().setTimelineTime(2, 4);
      await vi.advanceTimersByTimeAsync(PREDECODE_IDLE_MS - 1);
      expect(engine.predecodeAround).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(engine.predecodeAround).toHaveBeenCalledOnce();
      const active = (
        engine.predecodeAround.mock.calls[0] as unknown as [
          number,
          () => boolean,
        ]
      )[1];
      expect(active()).toBe(true);
      useEditorStore.getState().setPlaying(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(active()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops back to paused when playback synchronization fails", async () => {
    engine.sync.mockRejectedValueOnce(new Error("media seek failed"));

    useEditorStore.getState().setPlaying(true);

    await vi.waitFor(() =>
      expect(useEditorStore.getState().playing).toBe(false),
    );
    expect(engine.play).not.toHaveBeenCalled();
  });
});

describe("clip scrubbing", () => {
  async function mountVideo() {
    const source = useProjectStore.getState().source!;
    const video: LoadedVideo = {
      asset: {
        id: "clip",
        name: "clip.mp4",
        width: 64,
        height: 64,
        durationSec: 6,
        source: { kind: "object-url", value: "blob:clip" },
        timeline: { startSec: 0, inSec: 0, durationSec: 2 },
      },
      element: {} as HTMLVideoElement,
      poster: source,
      objectUrl: "blob:clip",
    };
    useProjectStore.setState({
      sourceVideo: video,
      project: {
        ...useProjectStore.getState().project!,
        videos: { source: video.asset },
      },
    });
    useEditorStore.getState().setTimelineTime(2, 4);
    await vi.waitFor(() =>
      expect(engine.sync).toHaveBeenLastCalledWith(2, { realtime: false }),
    );
    engine.sync.mockClear();
  }

  it("refreshes at fixed tau during clip movement, including the last queued edit", async () => {
    await mountVideo();
    let finish = () => {};
    engine.sync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    useProjectStore.getState().updateVideoTimeline("source", { startSec: 0.5 });
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledOnce());
    useProjectStore.getState().updateVideoTimeline("source", { startSec: 1 });
    useProjectStore.getState().updateVideoTimeline("source", { startSec: 1.5 });
    expect(engine.sync).toHaveBeenCalledOnce();
    finish();
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(2));
    expect(engine.sync).toHaveBeenLastCalledWith(2, { realtime: false });
    expect(engine.setProject).toHaveBeenLastCalledWith(
      useProjectStore.getState().project,
    );
    expect(useEditorStore.getState().tauSec).toBe(2);
    expect(
      useProjectStore.getState().project!.videos!.source!.timeline.startSec,
    ).toBe(1.5);
  });

  it("updates the time mapping without restarting playback for metadata-only edits", async () => {
    await mountVideo();
    useEditorStore.getState().setPlaying(true);
    await vi.waitFor(() => expect(engine.play).toHaveBeenCalledOnce());
    engine.sync.mockClear();
    engine.play.mockClear();
    useProjectStore.getState().updateVideoTimeline("source", { startSec: 1 });
    await Promise.resolve();
    expect(engine.setProject).toHaveBeenLastCalledWith(
      useProjectStore.getState().project,
    );
    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.sync).not.toHaveBeenCalled();
    expect(useEditorStore.getState().playing).toBe(true);
  });
});

describe("preview sync status", () => {
  it("is pending while a scrub sync is in flight and records its duration", async () => {
    const { getPreviewSyncStatus } = await import("./previewSyncStatus");
    let finishSync = () => {};
    engine.sync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSync = resolve;
        }),
    );

    useEditorStore.getState().setTimelineTime(1, 4);
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledOnce());
    expect(getPreviewSyncStatus().pendingSince).not.toBeNull();
    expect(getPreviewSyncStatus().phase).toBe("frame");

    finishSync();
    await vi.waitFor(() =>
      expect(getPreviewSyncStatus().pendingSince).toBeNull(),
    );
    expect(getPreviewSyncStatus().phase).toBeNull();
    expect(getPreviewSyncStatus().lastDurationMs).toBeGreaterThanOrEqual(0);
  });
});
