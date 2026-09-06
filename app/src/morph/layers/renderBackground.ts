import type { ExportOutputKind, RenderBackground } from "@/morph/model/export";
import { normalizeBackgroundForOutput } from "@/morph/model/export";

export type Rgba = readonly [number, number, number, number];

export function backgroundClearColor(background: RenderBackground): Rgba {
  switch (background) {
    case "transparent":
      return [0, 0, 0, 0];
    case "white":
      return [1, 1, 1, 1];
    case "black":
      return [0, 0, 0, 1];
  }
}

export function backgroundUniform(background: RenderBackground): Rgba {
  const [r, g, b] = backgroundClearColor(background);
  return [r, g, b, background === "transparent" ? 0 : 1];
}

export function canvasAlphaMode(
  background: RenderBackground,
): GPUCanvasAlphaMode {
  return background === "transparent" ? "premultiplied" : "opaque";
}

export function backgroundForOutput(
  outputKind: ExportOutputKind,
  background: RenderBackground,
): RenderBackground {
  return normalizeBackgroundForOutput(outputKind, background);
}
