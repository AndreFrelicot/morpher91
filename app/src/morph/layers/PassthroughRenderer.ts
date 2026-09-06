import type { GpuImageSlot } from "@/morph/algorithms/MorphBackend";
import { createLinearSampler } from "@/morph/gpu/textures";
import passthroughWgsl from "./passthrough.wgsl?raw";

export type UvRect = { x: number; y: number; width: number; height: number };

const UNIFORM_FLOATS = 8;

/**
 * Draws a single shared texture (one source/target frame) into a side pane,
 * letterboxed inside the project content box and honouring the viewport's
 * zoom/pan via canvas-UV rects (PRD M10). Lightweight sibling of
 * {@link LayeredRenderer}: one texture in, one full-screen pass out.
 */
export class PassthroughRenderer {
  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.sampler = createLinearSampler(device);
    const module = device.createShaderModule({ code: passthroughWgsl });
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
    slot: GpuImageSlot,
    imageRect: UvRect,
    contentRect: UvRect,
  ): void {
    this.uniformData.set(
      [imageRect.x, imageRect.y, imageRect.width, imageRect.height],
      0,
    );
    this.uniformData.set(
      [contentRect.x, contentRect.y, contentRect.width, contentRect.height],
      4,
    );
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: slot.view },
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

  dispose(): void {
    this.uniformBuffer.destroy();
  }
}
