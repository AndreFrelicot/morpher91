import type { RenderBackground } from "@/morph/model";
import { createLinearSampler } from "@/morph/gpu/textures";
import { backgroundClearColor, backgroundUniform } from "./renderBackground";
import presentWgsl from "./present.wgsl?raw";

export class PresentRenderer {
  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformData = new Float32Array(4);

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.sampler = createLinearSampler(device);
    const module = device.createShaderModule({ code: presentWgsl });
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
    source: GPUTextureView,
    target: GPUTextureView,
    background: RenderBackground,
  ): void {
    this.uniformData.set(backgroundUniform(background));
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          clearValue: toGpuColor(backgroundClearColor(background)),
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

  clear(target: GPUTextureView, background: RenderBackground): void {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          clearValue: toGpuColor(backgroundClearColor(background)),
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

function toGpuColor(
  color: readonly [number, number, number, number],
): GPUColorDict {
  return { r: color[0], g: color[1], b: color[2], a: color[3] };
}
