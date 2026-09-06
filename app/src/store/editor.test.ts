import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";

beforeEach(() => {
  useEditorStore.setState({
    selection: [],
    activeLayerId: "global",
    viewportOverlays: {
      source: {
        features: true,
        mesh: false,
        tpsGrid: false,
        beierField: false,
      },
      preview: {
        features: true,
        mesh: false,
        tpsGrid: false,
        beierField: false,
      },
      target: {
        features: true,
        mesh: false,
        tpsGrid: false,
        beierField: false,
      },
    },
    layerDebugMode: "composite",
    overlayLayerScope: "selected",
    showLayerStack: false,
    hoveredLayerId: null,
  });
});

describe("editorStore selection", () => {
  it("replaces by default", () => {
    useEditorStore.getState().selectFeature("a");
    useEditorStore.getState().selectFeature("b");
    expect(useEditorStore.getState().selection).toEqual(["b"]);
  });

  it("adds without duplicates", () => {
    useEditorStore.getState().selectFeature("a");
    useEditorStore.getState().selectFeature("b", "add");
    useEditorStore.getState().selectFeature("a", "add");
    expect(useEditorStore.getState().selection).toEqual(["a", "b"]);
  });

  it("toggles membership", () => {
    useEditorStore.getState().selectFeature("a");
    useEditorStore.getState().selectFeature("b", "toggle");
    useEditorStore.getState().selectFeature("a", "toggle");
    expect(useEditorStore.getState().selection).toEqual(["b"]);
  });

  it("clears selection", () => {
    useEditorStore.getState().selectFeature("a");
    useEditorStore.getState().clearSelection();
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it("tracks the active layer", () => {
    useEditorStore.getState().setActiveLayer("face");
    expect(useEditorStore.getState().activeLayerId).toBe("face");
  });

  it("tracks master timeline seconds alongside normalized progress", () => {
    useEditorStore.getState().setTimelineTime(2, 8);
    expect(useEditorStore.getState().tauSec).toBe(2);
    expect(useEditorStore.getState().t).toBe(0.25);
  });

  it("patches one viewport overlay setting", () => {
    useEditorStore.getState().setViewportOverlays("preview", { mesh: true });
    expect(useEditorStore.getState().viewportOverlays.preview).toEqual({
      features: true,
      mesh: true,
      tpsGrid: false,
      beierField: false,
    });
    expect(useEditorStore.getState().viewportOverlays.source.mesh).toBe(false);
  });

  it("patches brush settings without dropping the rest (M11 lot 3)", () => {
    const initial = useEditorStore.getState().brush;
    expect(initial).toEqual({
      diameter: 0.08,
      hardness: 0.5,
      strength: 1,
      erase: false,
    });
    useEditorStore.getState().setBrush({ erase: true, diameter: 0.2 });
    expect(useEditorStore.getState().brush).toEqual({
      diameter: 0.2,
      hardness: 0.5,
      strength: 1,
      erase: true,
    });
  });

  it("tracks layer debug viewport state", () => {
    useEditorStore.getState().setLayerDebugMode("layer-mask");
    useEditorStore.getState().setOverlayLayerScope("all");
    useEditorStore.getState().setShowLayerStack(true);
    useEditorStore.getState().setHoveredLayer("face");

    expect(useEditorStore.getState().layerDebugMode).toBe("layer-mask");
    expect(useEditorStore.getState().overlayLayerScope).toBe("all");
    expect(useEditorStore.getState().showLayerStack).toBe(true);
    expect(useEditorStore.getState().hoveredLayerId).toBe("face");
  });
});
