import { renderedRegionRing } from "@/lib/geometry/regionContour";
import { triangulatePolygon } from "@/lib/geometry/triangulatePolygon";
import { containRect, type Rect } from "@/lib/viewport/projectSpace";
import { createLinearSampler } from "@/morph/gpu/textures";
import type { MorphProject, RegionFeaturePair, Vec2 } from "@/morph/model";
import maskBlurWgsl from "./maskBlur.wgsl?raw";
import maskDownsampleWgsl from "./maskDownsample.wgsl?raw";
import maskFillWgsl from "./maskFill.wgsl?raw";

const MASK_FORMAT: GPUTextureFormat = "r8unorm";
const SAMPLE_COUNT = 4;
const FLOATS_PER_VERTEX = 2;
export const MAX_BLUR_RADIUS = 16;

type MaskTarget = {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
};

/** Rasterizes hard vector-region masks directly into a scalar GPU texture. */
export class GpuMaskRenderer {
  private readonly device: GPUDevice;
  private readonly fillPipeline: GPURenderPipeline;
  private readonly downsamplePipeline: GPURenderPipeline;
  private readonly blurPipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly horizontalUniform: GPUBuffer;
  private readonly verticalUniform: GPUBuffer;
  private target: MaskTarget | null = null;
  private multisample: MaskTarget | null = null;
  private downsampleTargets: MaskTarget[] = [];
  private blurPing: MaskTarget | null = null;
  private blurPong: MaskTarget | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexCapacity = 0;

  constructor(device: GPUDevice) {
    this.device = device;
    const fillModule = device.createShaderModule({ code: maskFillWgsl });
    this.fillPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: fillModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
        ],
      },
      fragment: {
        module: fillModule,
        entryPoint: "fs",
        targets: [{ format: MASK_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
      multisample: { count: SAMPLE_COUNT },
    });
    const downsampleModule = device.createShaderModule({
      code: maskDownsampleWgsl,
    });
    this.downsamplePipeline = fullscreenPipeline(
      device,
      downsampleModule,
      MASK_FORMAT,
    );
    const blurModule = device.createShaderModule({ code: maskBlurWgsl });
    this.blurPipeline = fullscreenPipeline(device, blurModule, MASK_FORMAT);
    this.sampler = createLinearSampler(device);
    const uniformUsage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.horizontalUniform = device.createBuffer({
      label: "vector-mask-blur-horizontal",
      size: 16,
      usage: uniformUsage,
    });
    this.verticalUniform = device.createBuffer({
      label: "vector-mask-blur-vertical",
      size: 16,
      usage: uniformUsage,
    });
  }

  renderHard(args: {
    project: MorphProject;
    region: RegionFeaturePair;
    t: number;
    width: number;
    height: number;
    contentRect?: Rect;
  }): GPUTextureView | null {
    const ring = renderedRegionRing(
      interpolatedRegionPoints(args.region, args.t),
      args.region.smooth,
    );
    const indices = triangulatePolygon(ring);
    if (indices.length < 3 || args.width <= 0 || args.height <= 0) return null;

    const rect =
      args.contentRect ??
      containRect(
        args.width,
        args.height,
        args.project.canvas.width / args.project.canvas.height,
      );
    const vertices = packClipVertices(
      ring,
      indices,
      rect,
      args.width,
      args.height,
    );
    this.syncTargets(args.width, args.height);
    this.writeVertices(vertices);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.multisample!.view,
          resolveTarget: this.target!.view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "discard",
        },
      ],
    });
    pass.setPipeline(this.fillPipeline);
    pass.setVertexBuffer(0, this.vertexBuffer!);
    pass.draw(indices.length);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return this.target!.view;
  }

  renderFeathered(args: {
    project: MorphProject;
    region: RegionFeaturePair;
    t: number;
    width: number;
    height: number;
    feather: number;
    contentRect?: Rect;
  }): GPUTextureView | null {
    const hard = this.renderHard(args);
    if (!hard) return null;
    const rect =
      args.contentRect ??
      containRect(
        args.width,
        args.height,
        args.project.canvas.width / args.project.canvas.height,
      );
    const featherPx =
      Math.max(0, args.feather) * Math.min(rect.width, rect.height);
    const plan = featherPassPlan(featherPx, args.width, args.height);
    if (plan.kernelRadius === 0) return hard;

    this.syncDownsampleTargets(plan.levels);
    const blurSize =
      plan.levels[plan.levels.length - 1] ??
      ({ width: args.width, height: args.height } as const);
    this.blurPing = syncTarget(
      this.device,
      this.blurPing,
      blurSize.width,
      blurSize.height,
    );
    this.blurPong = syncTarget(
      this.device,
      this.blurPong,
      blurSize.width,
      blurSize.height,
    );

    const horizontal = new Float32Array([
      1 / blurSize.width,
      0,
      plan.sigma,
      plan.kernelRadius,
    ]);
    const vertical = new Float32Array([
      0,
      1 / blurSize.height,
      plan.sigma,
      plan.kernelRadius,
    ]);
    this.device.queue.writeBuffer(this.horizontalUniform, 0, horizontal);
    this.device.queue.writeBuffer(this.verticalUniform, 0, vertical);

    const encoder = this.device.createCommandEncoder();
    let source = hard;
    for (const target of this.downsampleTargets) {
      this.drawFullscreen(
        encoder,
        this.downsamplePipeline,
        source,
        target.view,
      );
      source = target.view;
    }
    this.drawFullscreen(
      encoder,
      this.blurPipeline,
      source,
      this.blurPing.view,
      this.horizontalUniform,
    );
    this.drawFullscreen(
      encoder,
      this.blurPipeline,
      this.blurPing.view,
      this.blurPong.view,
      this.verticalUniform,
    );
    this.device.queue.submit([encoder.finish()]);
    return this.blurPong.view;
  }

  dispose(): void {
    this.target?.texture.destroy();
    this.multisample?.texture.destroy();
    for (const target of this.downsampleTargets) target.texture.destroy();
    this.blurPing?.texture.destroy();
    this.blurPong?.texture.destroy();
    this.vertexBuffer?.destroy();
    this.horizontalUniform.destroy();
    this.verticalUniform.destroy();
    this.target = null;
    this.multisample = null;
    this.downsampleTargets = [];
    this.blurPing = null;
    this.blurPong = null;
    this.vertexBuffer = null;
    this.vertexCapacity = 0;
  }

  private syncTargets(width: number, height: number): void {
    if (
      this.target?.width === width &&
      this.target.height === height &&
      this.multisample?.width === width &&
      this.multisample.height === height
    ) {
      return;
    }
    this.target?.texture.destroy();
    this.multisample?.texture.destroy();
    this.target = createTarget(this.device, width, height, 1);
    this.multisample = createTarget(this.device, width, height, SAMPLE_COUNT);
  }

  private writeVertices(vertices: Float32Array): void {
    if (!this.vertexBuffer || this.vertexCapacity < vertices.byteLength) {
      this.vertexBuffer?.destroy();
      this.vertexCapacity = nextPowerOfTwo(Math.max(vertices.byteLength, 256));
      this.vertexBuffer = this.device.createBuffer({
        label: "vector-mask-vertices",
        size: this.vertexCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  private syncDownsampleTargets(
    levels: Array<{ width: number; height: number }>,
  ): void {
    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      this.downsampleTargets[index] = syncTarget(
        this.device,
        this.downsampleTargets[index] ?? null,
        level.width,
        level.height,
      );
    }
    for (
      let index = levels.length;
      index < this.downsampleTargets.length;
      index++
    ) {
      this.downsampleTargets[index].texture.destroy();
    }
    this.downsampleTargets.length = levels.length;
  }

  private drawFullscreen(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    source: GPUTextureView,
    target: GPUTextureView,
    uniform?: GPUBuffer,
  ): void {
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: source },
      { binding: 1, resource: this.sampler },
    ];
    if (uniform) entries.push({ binding: 2, resource: { buffer: uniform } });
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });
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
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
}

export type FeatherPassPlan = {
  levels: Array<{ width: number; height: number }>;
  sigma: number;
  kernelRadius: number;
};

/** Chooses a reduced blur level so three sigma fits the bounded WGSL kernel. */
export function featherPassPlan(
  featherPx: number,
  width: number,
  height: number,
): FeatherPassPlan {
  if (featherPx <= 0.5 || width <= 0 || height <= 0) {
    return { levels: [], sigma: 0, kernelRadius: 0 };
  }
  const levels: Array<{ width: number; height: number }> = [];
  let levelWidth = width;
  let levelHeight = height;
  let scale = 1;
  while (
    Math.ceil((3 * featherPx) / scale) > MAX_BLUR_RADIUS &&
    (levelWidth > 1 || levelHeight > 1)
  ) {
    levelWidth = Math.max(1, Math.ceil(levelWidth / 2));
    levelHeight = Math.max(1, Math.ceil(levelHeight / 2));
    scale *= 2;
    levels.push({ width: levelWidth, height: levelHeight });
  }
  const sigma = Math.max(0.5, featherPx / scale);
  return {
    levels,
    sigma,
    kernelRadius: Math.min(MAX_BLUR_RADIUS, Math.ceil(3 * sigma)),
  };
}

function createTarget(
  device: GPUDevice,
  width: number,
  height: number,
  sampleCount: number,
): MaskTarget {
  const texture = device.createTexture({
    label: sampleCount === 1 ? "vector-mask-hard" : "vector-mask-msaa",
    size: [width, height],
    format: MASK_FORMAT,
    sampleCount,
    usage:
      sampleCount === 1
        ? GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        : GPUTextureUsage.RENDER_ATTACHMENT,
  });
  return {
    texture,
    view: texture.createView(),
    width,
    height,
  };
}

function syncTarget(
  device: GPUDevice,
  current: MaskTarget | null,
  width: number,
  height: number,
): MaskTarget {
  if (current?.width === width && current.height === height) return current;
  current?.texture.destroy();
  return createTarget(device, width, height, 1);
}

function fullscreenPipeline(
  device: GPUDevice,
  module: GPUShaderModule,
  format: GPUTextureFormat,
): GPURenderPipeline {
  return device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
}

function interpolatedRegionPoints(
  region: RegionFeaturePair,
  t: number,
): Vec2[] {
  const count = Math.min(region.a.length, region.b.length);
  const points: Vec2[] = [];
  for (let index = 0; index < count; index++) {
    points.push({
      x: region.a[index].x * (1 - t) + region.b[index].x * t,
      y: region.a[index].y * (1 - t) + region.b[index].y * t,
    });
  }
  return points;
}

function packClipVertices(
  ring: Vec2[],
  indices: number[],
  rect: Rect,
  width: number,
  height: number,
): Float32Array {
  const vertices = new Float32Array(indices.length * FLOATS_PER_VERTEX);
  let offset = 0;
  for (const index of indices) {
    const point = ring[index];
    const x = rect.x + point.x * rect.width;
    const y = rect.y + point.y * rect.height;
    vertices[offset++] = (x / width) * 2 - 1;
    vertices[offset++] = 1 - (y / height) * 2;
  }
  return vertices;
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}
