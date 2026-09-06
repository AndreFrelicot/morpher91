import type { MorphBackend, MorphFrame } from "@/morph/algorithms/MorphBackend";
import { CrossfadeRenderer } from "./CrossfadeRenderer";

/**
 * Crossfade as a {@link MorphBackend} (PRD §10.2). Thin adapter over the
 * single-pass {@link CrossfadeRenderer}.
 */
export class CrossfadeBackend implements MorphBackend {
  readonly id = "crossfade" as const;
  private readonly renderer: CrossfadeRenderer;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.renderer = new CrossfadeRenderer(device, format);
  }

  renderFrame(frame: MorphFrame): void {
    this.renderer.render(
      frame.target,
      frame.canvasWidth,
      frame.canvasHeight,
      frame.project.canvas.width,
      frame.project.canvas.height,
      frame.a,
      frame.b,
      frame.dissolveT ?? frame.t,
      frame.contentRect,
    );
  }

  renderWarpMap(frame: MorphFrame): void {
    this.renderer.renderWarpMap(
      frame.target,
      frame.canvasWidth,
      frame.canvasHeight,
      frame.project.canvas.width,
      frame.project.canvas.height,
      frame.contentRect,
    );
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
