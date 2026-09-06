import { describe, expect, it } from "vitest";
import {
  createProject,
  defaultExportSettings,
  defaultPlacement,
  type ExportSettings,
  type ImageAsset,
} from "@/morph/model";
import { resolveExportDimensions, toEvenDimensions } from "./exportDimensions";

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

const settings = (patch: Partial<ExportSettings> = {}): ExportSettings => ({
  ...defaultExportSettings,
  ...patch,
});

describe("resolveExportDimensions", () => {
  const project = {
    ...createProject(image("source", 1536, 864), image("target", 1536, 768)),
    canvas: {
      aspectRatio: "16:9" as const,
      width: 1920,
      height: 1080,
      background: "black" as const,
    },
  };

  it("uses the project canvas for the project preset", () => {
    expect(
      resolveExportDimensions(
        project,
        settings({ resolutionPreset: "project" }),
      ),
    ).toEqual({ width: 1920, height: 1080 });
  });

  it("uses native source and target dimensions", () => {
    expect(
      resolveExportDimensions(
        project,
        settings({ resolutionPreset: "source" }),
      ),
    ).toEqual({ width: 1536, height: 864 });
    expect(
      resolveExportDimensions(
        project,
        settings({ resolutionPreset: "target" }),
      ),
    ).toEqual({ width: 1536, height: 768 });
  });

  it("prefers decoded export image dimensions when provided", () => {
    expect(
      resolveExportDimensions(
        project,
        settings({ resolutionPreset: "source" }),
        { source: { width: 1774, height: 887 } },
      ),
    ).toEqual({ width: 1774, height: 887 });
    expect(
      resolveExportDimensions(
        project,
        settings({ resolutionPreset: "target" }),
        { target: { width: 1672, height: 941 } },
      ),
    ).toEqual({ width: 1672, height: 941 });
  });

  it("uses explicit dimensions for custom", () => {
    expect(
      resolveExportDimensions(
        project,
        settings({ resolutionPreset: "custom", width: 800, height: 600 }),
      ),
    ).toEqual({ width: 800, height: 600 });
  });
});

describe("toEvenDimensions", () => {
  it("rounds odd width/height down to even", () => {
    expect(toEvenDimensions({ width: 1775, height: 887 })).toEqual({
      width: 1774,
      height: 886,
    });
  });

  it("leaves even dimensions untouched", () => {
    expect(toEvenDimensions({ width: 1280, height: 720 })).toEqual({
      width: 1280,
      height: 720,
    });
  });
});
