import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";

const instances = vi.hoisted(
  () =>
    [] as Array<{
      setProject: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }>,
);
vi.mock("@/morph/gpu/sharedDevice", () => ({
  getSharedGpu: async () => ({ device: {} }),
}));
vi.mock("./PreviewEngine", () => ({
  PreviewEngine: class {
    setProject = vi.fn();
    dispose = vi.fn();
    subscribe = vi.fn();
    constructor() {
      instances.push(this);
    }
  },
}));

import { disposePreviewEngine, ensurePreviewEngine } from "./previewEngineHost";

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
function video(name: string): LoadedVideo {
  return {
    asset: {
      id: name,
      name,
      width: 64,
      height: 64,
      durationSec: 6,
      source: { kind: "object-url", value: `blob:${name}` },
      timeline: { startSec: 0, inSec: 0, durationSec: 4 },
    },
    objectUrl: `blob:${name}`,
    element: {} as HTMLVideoElement,
    poster: { asset: image(name), bitmap: {} as ImageBitmap },
  };
}

beforeEach(() => {
  disposePreviewEngine();
  instances.length = 0;
  const sourceVideo = video("a");
  const targetVideo = video("b");
  const project = createProject(
    sourceVideo.poster.asset,
    targetVideo.poster.asset,
  );
  project.timeline.durationSec = 12;
  project.videos = { source: sourceVideo.asset, target: targetVideo.asset };
  useProjectStore.setState({
    project,
    source: sourceVideo.poster,
    target: targetVideo.poster,
    sourceVideo,
    targetVideo,
  });
});
afterEach(() => disposePreviewEngine());

describe("preview engine media identity", () => {
  it("retains the decoder and caches throughout source/target clip edits", async () => {
    const original = await ensurePreviewEngine();
    for (const slot of ["source", "target"] as const) {
      for (let step = 0; step < 10; step++) {
        useProjectStore.getState().updateVideoTimeline(slot, {
          startSec: step / 10,
          inSec: step / 20,
          durationSec: 3,
        });
        expect(await ensurePreviewEngine()).toBe(original);
      }
    }
    expect(instances).toHaveLength(1);
    expect(instances[0].dispose).not.toHaveBeenCalled();
    expect(instances[0].setProject).toHaveBeenLastCalledWith(
      useProjectStore.getState().project,
    );
  });

  it("rebuilds for replaced footage even if the wrapper retains its element", async () => {
    const original = await ensurePreviewEngine();
    const sourceVideo = useProjectStore.getState().sourceVideo!;
    useProjectStore.setState({
      sourceVideo: { ...sourceVideo, objectUrl: "blob:replacement" },
    });
    expect(await ensurePreviewEngine()).not.toBe(original);
    expect(instances).toHaveLength(2);
    expect(instances[0].dispose).toHaveBeenCalledOnce();
  });

  it("rebuilds when decoded dimensions change", async () => {
    const original = await ensurePreviewEngine();
    const targetVideo = useProjectStore.getState().targetVideo!;
    useProjectStore.setState({
      targetVideo: {
        ...targetVideo,
        asset: { ...targetVideo.asset, width: 128 },
      },
    });
    expect(await ensurePreviewEngine()).not.toBe(original);
    expect(instances[0].dispose).toHaveBeenCalledOnce();
  });
});
