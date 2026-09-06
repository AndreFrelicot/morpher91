import { describe, expect, it } from "vitest";
import {
  createProject,
  defaultPlacement,
  type FeaturePair,
  type ImageAsset,
  type MorphProject,
} from "@/morph/model";
import { projectForExportResolution } from "./exportProject";

function image(name: string, width: number, height: number): ImageAsset {
  return {
    id: name,
    name,
    width,
    height,
    source: { kind: "data-url", value: "data:image/png;base64," },
    placement: defaultPlacement(),
  };
}

function baseProject(): MorphProject {
  const feature: FeaturePair = {
    id: "point-1",
    kind: "point",
    enabled: true,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    a: { x: 0.5, y: 0.25 },
    b: { x: 0.2, y: 0.3 },
  };

  return {
    ...createProject(image("source", 2000, 1000), image("target", 1000, 1000)),
    canvas: {
      aspectRatio: "1:1",
      width: 1000,
      height: 1000,
      background: "black",
    },
    features: [feature],
  };
}

describe("projectForExportResolution", () => {
  it("returns the original project for non-native presets", () => {
    const project = baseProject();

    expect(
      projectForExportResolution({
        project,
        preset: "project",
        dimensions: { width: 1000, height: 1000 },
        images: {
          source: { width: 4000, height: 2000 },
          target: { width: 1000, height: 1000 },
        },
      }),
    ).toBe(project);
  });

  it("remaps features from the preview placement into a source-sized export canvas", () => {
    const project = baseProject();

    const exported = projectForExportResolution({
      project,
      preset: "source",
      dimensions: { width: 4000, height: 2000 },
      images: {
        source: { width: 4000, height: 2000 },
        target: { width: 1000, height: 1000 },
      },
      displayImages: {
        source: { width: 2000, height: 1000 },
        target: { width: 1000, height: 1000 },
      },
    });

    expect(exported.canvas.width).toBe(4000);
    expect(exported.canvas.height).toBe(2000);
    expect(exported.images.source.width).toBe(4000);

    const feature = exported.features[0];
    expect(feature.kind).toBe("point");
    if (feature.kind !== "point") throw new Error("Expected a point feature.");
    expect(feature.a.x).toBeCloseTo(0.5);
    expect(feature.a.y).toBeCloseTo(0);
    expect(feature.b.x).toBeCloseTo(0.35);
    expect(feature.b.y).toBeCloseTo(0.3);
  });
});
