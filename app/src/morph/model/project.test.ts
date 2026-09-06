import { describe, it, expect } from "vitest";
import { createProject, defaultPlacement, type ImageAsset } from "./index";

function dummyImage(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 512,
    height: 512,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
}

describe("createProject", () => {
  it("creates a valid v1 project with a global layer and crossfade default", () => {
    const project = createProject(dummyImage("a"), dummyImage("b"));

    expect(project.version).toBe(1);
    expect(project.features).toEqual([]);
    expect(project.layers).toHaveLength(1);
    expect(project.layers[0].featureIds).toBe("all");
    expect(project.activeAlgorithm).toBe("crossfade");
    expect(project.timeline.durationSec).toBe(4);
    expect(project.algorithmSettings.beierNeely.maxLines).toBe(256);
    expect(project.images.source.name).toBe("a");
    expect(project.images.target.name).toBe("b");
  });
});
