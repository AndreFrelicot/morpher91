import { describe, expect, it } from "vitest";
import maskPaintSource from "@/features/editor/MaskPaintLayer.tsx?raw";
import morphCanvasSource from "@/features/editor/MorphCanvas.tsx?raw";
import overlayCanvasSource from "@/features/editor/OverlayCanvas.tsx?raw";
import passthroughSource from "@/features/editor/PassthroughViewport.tsx?raw";

describe("viewport render surface contract", () => {
  it("uses the shared backing budget on every full-viewport WebGPU canvas", () => {
    for (const source of [
      morphCanvasSource,
      passthroughSource,
      overlayCanvasSource,
      maskPaintSource,
    ]) {
      expect(source).toContain("currentViewportBackingSize(");
      expect(source).not.toContain("window.devicePixelRatio");
    }
  });
});
