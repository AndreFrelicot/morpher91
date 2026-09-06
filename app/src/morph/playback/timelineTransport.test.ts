import { beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  defaultPlacement,
  defaultVideoTimeline,
  type ImageAsset,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import {
  seekTimeline,
  stepTimelineFrame,
  toggleTimelinePlayback,
} from "./timelineTransport";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 100,
  height: 100,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

beforeEach(() => {
  useEditorStore.getState().resetEditor();
  const project = createProject(image("a"), image("b"));
  project.timeline = { ...project.timeline, durationSec: 4, fps: 20 };
  useProjectStore.setState({
    project,
    sourceVideo: null,
    targetVideo: null,
  });
});

describe("timeline transport", () => {
  it("toggles playback and restarts from the end", () => {
    seekTimeline(4);

    expect(toggleTimelinePlayback()).toBe(true);
    expect(useEditorStore.getState()).toMatchObject({
      playing: true,
      tauSec: 0,
    });
    expect(toggleTimelinePlayback()).toBe(true);
    expect(useEditorStore.getState().playing).toBe(false);
  });

  it("steps by project fps or skips to a boundary", () => {
    seekTimeline(2);
    stepTimelineFrame(1);
    expect(useEditorStore.getState().tauSec).toBeCloseTo(2.05);
    stepTimelineFrame(-1, true);
    expect(useEditorStore.getState().tauSec).toBe(0);
    stepTimelineFrame(1, true);
    expect(useEditorStore.getState().tauSec).toBe(4);
  });

  it("refuses playback while a saved video is missing", () => {
    const project = useProjectStore.getState().project!;
    project.videos = {
      source: {
        id: "video",
        name: "missing.mov",
        width: 100,
        height: 100,
        durationSec: 4,
        fingerprint: "missing",
        source: {
          kind: "external-video-placeholder",
          value: "missing.mov",
        },
        timeline: defaultVideoTimeline(4),
      },
    };

    expect(toggleTimelinePlayback()).toBe(false);
    expect(useEditorStore.getState().playing).toBe(false);
  });
});
