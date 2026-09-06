import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetProjectSession } from "./projectSession";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import type { LoadedImage } from "@/lib/image/loadImage";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";

function loadedImage(name: string): LoadedImage {
  const asset: ImageAsset = {
    id: name,
    name,
    width: 100,
    height: 100,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
  return {
    asset,
    bitmap: { close: vi.fn() } as unknown as ImageBitmap,
  };
}

beforeEach(() => {
  const source = loadedImage("source");
  const target = loadedImage("target");
  useProjectStore.setState({
    source,
    target,
    sourceVideo: null,
    targetVideo: null,
    project: createProject(source.asset, target.asset),
    activeAlgorithm: "thin-plate-spline",
  });
  useEditorStore.setState({
    activeTab: "compare",
    activeTool: "brush",
    activeLayerId: "custom-layer",
    selection: ["feature"],
    tauSec: 2,
    t: 0.5,
    playing: true,
    layerDebugMode: "layer-mask",
    showLayerStack: true,
    viewportsLinked: false,
    viewports: {
      source: { zoom: 2, pan: { x: 3, y: 4 } },
      preview: { zoom: 3, pan: { x: 5, y: 6 } },
      target: { zoom: 4, pan: { x: 7, y: 8 } },
    },
  });
  useHistoryStore.setState({ past: [[]], future: [[]], pending: [] });
});

describe("resetProjectSession", () => {
  it("resets all project-derived state and releases media once", () => {
    const { source, target } = useProjectStore.getState();

    resetProjectSession();
    resetProjectSession();

    expect(source?.bitmap.close).toHaveBeenCalledTimes(1);
    expect(target?.bitmap.close).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState()).toMatchObject({
      project: null,
      source: null,
      target: null,
      activeAlgorithm: "crossfade",
    });
    expect(useHistoryStore.getState()).toMatchObject({
      past: [],
      future: [],
      pending: null,
    });
    expect(useEditorStore.getState()).toMatchObject({
      activeTab: "studio",
      activeTool: "select",
      activeLayerId: "global",
      selection: [],
      tauSec: 0,
      t: 0,
      playing: false,
      layerDebugMode: "composite",
      showLayerStack: false,
      viewportsLinked: true,
      viewports: {
        source: { zoom: 1, pan: { x: 0, y: 0 } },
        preview: { zoom: 1, pan: { x: 0, y: 0 } },
        target: { zoom: 1, pan: { x: 0, y: 0 } },
      },
    });
  });
});
