import { beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
  type PointFeaturePair,
} from "@/morph/model";
import { useProjectStore } from "./projectStore";
import { useHistoryStore } from "./historyStore";

function img(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 512,
    height: 512,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
}

function point(id: string, x: number): PointFeaturePair {
  return {
    id,
    kind: "point",
    enabled: true,
    a: { x, y: 0 },
    b: { x, y: 0 },
    createdAt: "t",
    updatedAt: "t",
  };
}

const features = () => useProjectStore.getState().project!.features;

beforeEach(() => {
  useProjectStore.setState({
    source: null,
    target: null,
    activeAlgorithm: "crossfade",
    project: createProject(img("a"), img("b")),
  });
  useHistoryStore.setState({ past: [], future: [], pending: null });
});

describe("historyStore", () => {
  it("records a transaction and undoes/redoes it", () => {
    useHistoryStore.getState().begin();
    useProjectStore.getState().addFeature(point("p1", 0.1));
    useHistoryStore.getState().commit();
    expect(features()).toHaveLength(1);
    expect(useHistoryStore.getState().past).toHaveLength(1);

    useHistoryStore.getState().undo();
    expect(features()).toHaveLength(0);

    useHistoryStore.getState().redo();
    expect(features()).toHaveLength(1);
    expect(features()[0].id).toBe("p1");
  });

  it("does not record a no-op transaction", () => {
    useHistoryStore.getState().begin();
    useHistoryStore.getState().commit();
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it("ignores timestamp-only changes (no-op drag)", () => {
    useProjectStore.getState().addFeature(point("p1", 0.1));
    useHistoryStore.setState({ past: [], future: [], pending: null });

    useHistoryStore.getState().begin();
    // updateFeature bumps updatedAt but geometry is unchanged.
    useProjectStore.getState().updateFeature("p1", { a: { x: 0.1, y: 0 } });
    useHistoryStore.getState().commit();
    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it("caps history at 100 entries", () => {
    for (let i = 0; i < 150; i++) {
      useHistoryStore.getState().begin();
      useProjectStore.getState().addFeature(point(`p${i}`, i / 200));
      useHistoryStore.getState().commit();
    }
    expect(useHistoryStore.getState().past).toHaveLength(100);
  });
});
