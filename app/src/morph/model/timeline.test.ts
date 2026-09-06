import { describe, expect, it } from "vitest";
import {
  createLayer,
  createProject,
  defaultPlacement,
  normalizeVideoTimeline,
  resolveTimelineFramePair,
  timelineEndSec,
  videoClipStatus,
  videoFrameAvailableAt,
  videoLocalTimeSec,
  videoMasterTimeSec,
  type ImageAsset,
  type VideoAsset,
} from "./index";

function image(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 512,
    height: 512,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
}

function video(name: string, durationSec: number): VideoAsset {
  return {
    id: name,
    name,
    width: 1280,
    height: 720,
    durationSec,
    source: { kind: "external-video-placeholder", value: name },
    timeline: { startSec: 0, inSec: 0, durationSec },
  };
}

describe("video timeline", () => {
  it("normalizes clips to crop inside the source media duration", () => {
    expect(
      normalizeVideoTimeline({ startSec: -2, inSec: 3, durationSec: 10 }, 6),
    ).toEqual({ startSec: 0, inSec: 3, durationSec: 3 });
  });

  it("maps master time to independent local video times", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = {
      source: {
        ...video("a.mov", 8),
        timeline: { startSec: 2, inSec: 1, durationSec: 4 },
      },
      target: {
        ...video("b.mov", 10),
        timeline: { startSec: 5, inSec: 3, durationSec: 4 },
      },
    };

    expect(videoLocalTimeSec(project, "source", 2)).toBe(1);
    expect(videoLocalTimeSec(project, "source", 4)).toBe(3);
    expect(videoLocalTimeSec(project, "source", 8)).toBe(5);
    expect(videoLocalTimeSec(project, "target", 6)).toBe(4);
  });

  it("maps local video times back to master tau, clamped to the clip (M11 lot 4a)", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = {
      source: {
        ...video("a.mov", 8),
        timeline: { startSec: 2, inSec: 1, durationSec: 4 },
      },
    };

    // Inverse of videoLocalTimeSec inside the clip span…
    expect(videoMasterTimeSec(project, "source", 1)).toBe(2);
    expect(videoMasterTimeSec(project, "source", 3)).toBe(4);
    expect(videoMasterTimeSec(project, "source", 5)).toBe(6);
    // …and clamped outside it.
    expect(videoMasterTimeSec(project, "source", 0)).toBe(2);
    expect(videoMasterTimeSec(project, "source", 9)).toBe(6);
    // No video on that slot: local time IS master time.
    expect(videoMasterTimeSec(project, "target", 3.5)).toBe(3.5);
  });

  it("reports whether source and target frames are available at tau", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = {
      source: {
        ...video("a.mov", 8),
        timeline: { startSec: 2, inSec: 1, durationSec: 4 },
      },
    };

    expect(videoFrameAvailableAt(project, "source", 1.9)).toBe(false);
    expect(videoFrameAvailableAt(project, "source", 2)).toBe(true);
    expect(videoFrameAvailableAt(project, "source", 6.1)).toBe(false);
    expect(videoFrameAvailableAt(project, "target", 6.1)).toBe(true);
    expect(videoClipStatus(project.videos.source, 1.9)).toBe("before");
    expect(videoClipStatus(project.videos.source, 6.1)).toBe("after");
  });

  it("resolves the same visible A/B pair for preview and offline rendering", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = {
      source: {
        ...video("a.mov", 2),
        timeline: { startSec: 0, inSec: 0, durationSec: 2 },
      },
      target: {
        ...video("b.mov", 2),
        timeline: { startSec: 3, inSec: 0, durationSec: 2 },
      },
    };
    const pair = { a: "source-frame", b: "target-frame" };

    expect(resolveTimelineFramePair(project, 1, pair)).toEqual({
      a: "source-frame",
      b: "source-frame",
    });
    expect(resolveTimelineFramePair(project, 2.5, pair)).toBeNull();
    expect(resolveTimelineFramePair(project, 4, pair)).toEqual({
      a: "target-frame",
      b: "target-frame",
    });

    project.videos.target!.timeline.startSec = 1;
    expect(resolveTimelineFramePair(project, 1.5, pair)).toBe(pair);
  });

  it("computes a fixed master timeline from source and target media durations", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = {
      source: {
        ...video("a.mov", 8),
        timeline: { startSec: 2, inSec: 1, durationSec: 4 },
      },
    };
    const layer = createLayer("Face", 1);
    layer.clip = { startSec: 9, durationSec: 2 };
    project.layers.push(layer);

    expect(timelineEndSec(project)).toBe(8);

    project.videos.target = {
      ...video("b.mov", 10),
      timeline: { startSec: 20, inSec: 0, durationSec: 10 },
    };
    expect(timelineEndSec(project)).toBe(18);
  });
});
