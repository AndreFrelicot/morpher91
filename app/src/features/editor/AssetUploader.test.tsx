import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  defaultPlacement,
  defaultVideoTimeline,
  type ImageAsset,
} from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { AssetUploader } from "./AssetUploader";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 640,
  height: 480,
  source: { kind: "external-file-placeholder", value: name },
  placement: defaultPlacement(),
});

beforeEach(() => {
  const project = createProject(image("expected.mov"), image("target.png"));
  project.videos = {
    source: {
      id: "saved-video",
      name: "expected.mov",
      width: 640,
      height: 480,
      durationSec: 4,
      source: {
        kind: "external-video-placeholder",
        value: "expected.mov",
      },
      timeline: defaultVideoTimeline(4),
    },
  };
  useProjectStore.setState({
    source: null,
    target: null,
    sourceVideo: null,
    targetVideo: null,
    project,
    activeAlgorithm: "crossfade",
  });
});

describe("AssetUploader missing video", () => {
  it("shows the expected file and separate relink/replace paths", () => {
    render(<AssetUploader slot="source" dotClassName="bg-image-a" />);

    expect(screen.getByText("expected.mov")).toBeInTheDocument();
    expect(
      screen.getByText("Video file must be reconnected"),
    ).toBeInTheDocument();
    expect(screen.getByText("Relink")).toBeInTheDocument();
    expect(
      screen.getByText("Replace with a different image or video"),
    ).toBeInTheDocument();
  });
});
