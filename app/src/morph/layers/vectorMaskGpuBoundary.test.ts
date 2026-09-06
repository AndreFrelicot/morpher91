import { describe, expect, it } from "vitest";
import maskCacheSource from "./MaskTextureCache.ts?raw";
import gpuRendererSource from "./GpuMaskRenderer.ts?raw";

describe("vector mask GPU boundary", () => {
  it("does not restore the removed Canvas2D rasterizer or vector uploads", () => {
    const vectorPath = `${maskCacheSource}\n${gpuRendererSource}`;

    expect(vectorPath).not.toMatch(/MaskRasterizer|rasterizeAndUpload/);
    expect(vectorPath).not.toMatch(
      /getContext\(["']2d|getImageData|\.filter\s*=/,
    );
  });

  it("keeps scalar textures for vector and fallback masks", () => {
    expect(maskCacheSource).toContain('format: "r8unorm"');
    expect(gpuRendererSource).toContain(
      'const MASK_FORMAT: GPUTextureFormat = "r8unorm"',
    );
  });
});
