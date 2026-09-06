import { describe, expect, it } from "vitest";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import {
  createProject,
  defaultPlacement,
  defaultVideoTimeline,
  type ImageAsset,
  type VideoAsset,
} from "@/morph/model";
import { assertExportMediaAvailable } from "./exportMorph";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 640,
  height: 480,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

const video: VideoAsset = {
  id: "video",
  name: "video.mov",
  width: 640,
  height: 480,
  durationSec: 4,
  source: { kind: "external-video-placeholder", value: "video.mov" },
  timeline: defaultVideoTimeline(4),
};

describe("assertExportMediaAvailable", () => {
  it("rejects a required video before export allocation", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = { source: video };
    expect(() => assertExportMediaAvailable({ project })).toThrow();
  });

  it("accepts a project once every required runtime video is linked", () => {
    const project = createProject(image("a"), image("b"));
    project.videos = { source: video };
    expect(() =>
      assertExportMediaAvailable({
        project,
        sourceVideo: { asset: video } as LoadedVideo,
      }),
    ).not.toThrow();
  });
});
