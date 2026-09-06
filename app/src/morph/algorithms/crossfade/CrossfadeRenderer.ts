import { computeUvTransform } from "@/lib/image/imagePlacement";
import { containRect, type Rect } from "@/lib/viewport/projectSpace";
import { createLinearSampler } from "@/morph/gpu/textures";
import { WARP_MAP_FORMAT } from "@/morph/algorithms/MorphBackend";
import crossfadeWgsl from "./crossfade.wgsl?raw";

const UNIFORM_FLOATS = 16; // 4 x vec4f
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

type ImageSlot = {
  view: GPUTextureView;
  width: number;
  height: number;
};

/**
 * Renders the crossfade baseline: each image is placed (contain) into the
 * canvas and the two are linearly blended by t in a single render pass.
 */
export class CrossfadeRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly warpPipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniformBuffer: GPUBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);
  private readonly device: GPUDevice;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    const module = device.createShaderModule({ code: crossfadeWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.warpPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: {
        module,
        entryPoint: "fs_warp",
        targets: [{ format: WARP_MAP_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.sampler = createLinearSampler(device);
    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Identity warp map (crossfade never warps) — see MorphBackend.renderWarpMap. */
  renderWarpMap(
    target: GPUTextureView,
    canvasWidth: number,
    canvasHeight: number,
    projectWidth: number,
    projectHeight: number,
    contentRect?: Rect,
  ): void {
    const projBox = computeProjBox(
      canvasWidth,
      canvasHeight,
      projectWidth / projectHeight,
      contentRect,
    );
    this.uniformData.fill(0);
    this.uniformData.set(projBox, 8);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.warpPipeline.getBindGroupLayout(0),
      entries: [{ binding: 3, resource: { buffer: this.uniformBuffer } }],
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
    pass.setPipeline(this.warpPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  render(
    target: GPUTextureView,
    canvasWidth: number,
    canvasHeight: number,
    projectWidth: number,
    projectHeight: number,
    a: ImageSlot,
    b: ImageSlot,
    t: number,
    contentRect?: Rect,
  ): void {
    const ta = computeUvTransform(
      projectWidth,
      projectHeight,
      a.width,
      a.height,
      "contain",
    );
    const tb = computeUvTransform(
      projectWidth,
      projectHeight,
      b.width,
      b.height,
      "contain",
    );
    const projBox = computeProjBox(
      canvasWidth,
      canvasHeight,
      projectWidth / projectHeight,
      contentRect,
    );

    this.uniformData.set([ta.scaleX, ta.scaleY, ta.offsetX, ta.offsetY], 0);
    this.uniformData.set([tb.scaleX, tb.scaleY, tb.offsetX, tb.offsetY], 4);
    this.uniformData.set(projBox, 8);
    this.uniformData.set([t, 0, 0, 0], 12);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: a.view },
        { binding: 1, resource: b.view },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
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

function computeProjBox(
  canvasWidth: number,
  canvasHeight: number,
  projectAspect: number,
  contentRect?: Rect,
): [number, number, number, number] {
  const rect =
    contentRect ?? containRect(canvasWidth, canvasHeight, projectAspect);
  return [
    rect.x / canvasWidth,
    rect.y / canvasHeight,
    rect.width / canvasWidth,
    rect.height / canvasHeight,
  ];
}
