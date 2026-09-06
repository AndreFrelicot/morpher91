import { createLinearSampler } from "@/morph/gpu/textures";
import type { UvRect } from "@/morph/layers/PassthroughRenderer";
import maskTintWgsl from "./maskTint.wgsl?raw";

const UNIFORM_FLOATS = 8;

/**
 * Draws the brush session's R8 mask as a translucent tint over a pane
 * (PRD M11 lot 3) — the live "what am I painting" feedback while the brush
 * tool is active. Lightweight sibling of {@link PassthroughRenderer}: one
 * texture in, one full-screen pass out, mapped to the project content box.
 */
export class MaskTintRenderer {
  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.sampler = createLinearSampler(device);
    const module = device.createShaderModule({ code: maskTintWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.uniformBuffer = device.createBuffer({
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  render(
    target: GPUTextureView,
    mask: GPUTextureView,
    contentRect: UvRect,
    tint: readonly [number, number, number, number],
  ): void {
    this.uniformData.set(
      [contentRect.x, contentRect.y, contentRect.width, contentRect.height],
      0,
    );
    this.uniformData.set(tint, 4);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: mask },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** Clears the pane (used when there is no mask to show). */
  clear(target: GPUTextureView): void {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.uniformBuffer.destroy();
  }
}
