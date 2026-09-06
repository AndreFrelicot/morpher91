import { containRect, type Rect } from "@/lib/viewport/projectSpace";
import { createLinearSampler } from "@/morph/gpu/textures";
import type { MorphProject } from "@/morph/model";
import type { MaskBind } from "./MaskTextureCache";
import { syncRenderTexture, type RenderTexture } from "./renderTexture";
import compositeWgsl from "./composite.wgsl?raw";

const UNIFORM_FLOATS = 8;
const MASK_MODE = 6;
const CONTRIBUTION_MODE = 7;

/** Owns the layer target, ping-pong accumulators and composite GPU pipeline. */
export class LayerCompositor {
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly fallbackView: GPUTextureView;
  private readonly sampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);
  private layerTarget: RenderTexture | null = null;
  private accumA: RenderTexture | null = null;
  private accumB: RenderTexture | null = null;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    fallbackView: GPUTextureView,
  ) {
    this.device = device;
    this.format = format;
    this.fallbackView = fallbackView;
    this.sampler = createLinearSampler(device);
    const module = device.createShaderModule({ code: compositeWgsl });
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

  sync(width: number, height: number): void {
    this.layerTarget = syncRenderTexture(
      this.device,
      this.layerTarget,
      width,
      height,
      this.format,
    );
    this.accumA = syncRenderTexture(
      this.device,
      this.accumA,
      width,
      height,
      this.format,
    );
    this.accumB = syncRenderTexture(
      this.device,
      this.accumB,
      width,
      height,
      this.format,
    );
  }

  layer(): RenderTexture {
    if (!this.layerTarget) throw new Error("Layer compositor is not sized.");
    return this.layerTarget;
  }

  accumulators(): [RenderTexture, RenderTexture] {
    if (!this.accumA || !this.accumB) {
      throw new Error("Layer compositor is not sized.");
    }
    return [this.accumA, this.accumB];
  }

  composite(args: {
    base: GPUTextureView;
    layer: GPUTextureView;
    mask: MaskBind;
    target: GPUTextureView;
    project: MorphProject;
    contentRect?: Rect;
    opacity: number;
    mode: number;
    invertMask: boolean;
  }): void {
    this.writeUniforms(
      args.project,
      args.contentRect,
      args.opacity,
      args.mode,
      args.mask,
      args.invertMask,
    );
    this.draw(args.base, args.layer, args.mask, args.target);
  }

  drawMask(args: {
    mask: MaskBind;
    target: GPUTextureView;
    project: MorphProject;
    contentRect?: Rect;
    invertMask: boolean;
  }): void {
    this.writeUniforms(
      args.project,
      args.contentRect,
      1,
      MASK_MODE,
      args.mask,
      args.invertMask,
    );
    this.draw(this.fallbackView, this.fallbackView, args.mask, args.target);
  }

  overlayContribution(args: {
    base: GPUTextureView;
    mask: MaskBind;
    target: GPUTextureView;
    project: MorphProject;
    contentRect?: Rect;
    invertMask: boolean;
  }): void {
    this.writeUniforms(
      args.project,
      args.contentRect,
      1,
      CONTRIBUTION_MODE,
      args.mask,
      args.invertMask,
    );
    this.draw(args.base, this.fallbackView, args.mask, args.target);
  }

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
    this.layerTarget?.texture.destroy();
    this.accumA?.texture.destroy();
    this.accumB?.texture.destroy();
    this.uniformBuffer.destroy();
    this.layerTarget = null;
    this.accumA = null;
    this.accumB = null;
  }

  private writeUniforms(
    project: MorphProject,
    contentRect: Rect | undefined,
    opacity: number,
    mode: number,
    mask: MaskBind,
    invertMask: boolean,
  ): void {
    const target = this.layer();
    this.uniformData.set(
      projectBox(project, target.width, target.height, contentRect),
      0,
    );
    this.uniformData.set(
      [opacity, mode, maskFlags(mask), invertMask ? 1 : 0],
      4,
    );
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);
  }

  private draw(
    base: GPUTextureView,
    layer: GPUTextureView,
    mask: MaskBind,
    target: GPUTextureView,
  ): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: base },
        { binding: 1, resource: layer },
        { binding: 2, resource: mask.view },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: { buffer: this.uniformBuffer } },
        { binding: 5, resource: mask.paintView },
        { binding: 6, resource: mask.warpView },
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
}

function maskFlags(mask: MaskBind): number {
  return (
    (mask.hasMask ? 1 : 0) | (mask.hasPaint ? 2 : 0) | (mask.hasWarp ? 4 : 0)
  );
}

function projectBox(
  project: MorphProject,
  width: number,
  height: number,
  contentRect?: Rect,
): [number, number, number, number] {
  const rect =
    contentRect ??
    containRect(width, height, project.canvas.width / project.canvas.height);
  return [
    rect.x / width,
    rect.y / height,
    rect.width / width,
    rect.height / height,
  ];
}
