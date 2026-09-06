import { describe, expect, it } from "vitest";
import morphCanvasSource from "@/features/editor/MorphCanvas.tsx?raw";
import exportSource from "@/morph/export/exportMorph.ts?raw";
import compositorSource from "./composite.wgsl?raw";
import layeredRendererSource from "./LayeredRenderer.ts?raw";

describe("vector mask pipeline contract", () => {
  it("keeps viewport and export behind the shared layered renderer", () => {
    expect(morphCanvasSource).toContain("new LayeredRenderer(");
    expect(exportSource).toContain("new LayeredRenderer(");
    expect(morphCanvasSource).not.toContain("GpuMaskRenderer");
    expect(exportSource).not.toContain("GpuMaskRenderer");
    expect(layeredRendererSource).toContain("new MaskTextureCache(");
  });

  it("uses the same mask cache for final and debug render modes", () => {
    expect(layeredRendererSource).toContain("this.masks.maskFor(");
    expect(layeredRendererSource).toContain("this.masks.coverageMaskFor(");
    expect(layeredRendererSource).toContain("this.masks.regionMask(");
  });

  it("keeps inversion and painted-mask union in the GPU compositor", () => {
    expect(compositorSource).toContain("max(value, paint)");
    expect(compositorSource).toContain("value = 1.0 - value");
    expect(compositorSource).toContain("layerAmount = layerAmount * maskValue");
  });
});
