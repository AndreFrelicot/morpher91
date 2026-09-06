import { computeUvTransform } from "@/lib/image/imagePlacement";
import { containRect, type Rect } from "@/lib/viewport/projectSpace";
import { createLinearSampler } from "@/morph/gpu/textures";
import {
  WARP_MAP_FORMAT,
  type MorphBackend,
  type MorphFrame,
} from "@/morph/algorithms/MorphBackend";
import type {
  BeierNeelySettings,
  FeaturePair,
  MorphProject,
} from "@/morph/model";
import { buildMorphLines, type MorphLine } from "./buildMorphLines";
import beierWgsl from "./beierNeely.wgsl?raw";
import { recordRenderDiagnostic } from "../renderDiagnostics";

/** Hard cap on control lines for v1 (PRD §18.3); sizes the storage buffer. */
const MAX_LINES = 256;
/** Floats per MorphLine in the GPU layout (a:vec4, b:vec4, params:vec4 = 48B). */
const FLOATS_PER_LINE = 12;

/**
 * Beier–Neely field morphing (PRD §10.5). A single fullscreen pass backward-warps
 * each pixel onto image A and B from the control lines and dissolves them — the
 * warp is computed in the shader, so there is no per-frame CPU solve. The line
 * set is rebuilt only when features or the line-affecting settings change; the
 * a/b/p weights and t are written every frame.
 */
export class BeierBackend implements MorphBackend {
  readonly id = "beier-neely" as const;

  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private readonly warpPipeline: GPURenderPipeline;
  private warpBindGroup: GPUBindGroup | null = null;

  private readonly linesBuffer: GPUBuffer;
  private readonly uBuffer: GPUBuffer;

  private readonly lineScratch = new Float32Array(MAX_LINES * FLOATS_PER_LINE);
  private readonly uData = new Float32Array(20);

  // Line cache: rebuilt when features (immutable ref) or settings change.
  private lineCount = 0;
  private cachedFeatures: FeaturePair[] | null = null;
  private cachedSettingsKey = "";

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.sampler = createLinearSampler(device);

    const module = device.createShaderModule({ code: beierWgsl });
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

    this.linesBuffer = device.createBuffer({
      size: this.lineScratch.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.uBuffer = device.createBuffer({
      size: this.uData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  renderFrame(frame: MorphFrame): void {
    this.writeFrameData(frame);
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: frame.a.view },
        { binding: 1, resource: frame.b.view },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.uBuffer } },
        { binding: 4, resource: { buffer: this.linesBuffer } },
      ],
    });
    this.drawPass(this.pipeline, bindGroup, frame.target);
  }

  /** A-side warp map for painted-mask advection — see MorphBackend. */
  renderWarpMap(frame: MorphFrame): void {
    this.writeFrameData(frame);
    this.warpBindGroup ??= this.device.createBindGroup({
      layout: this.warpPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 3, resource: { buffer: this.uBuffer } },
        { binding: 4, resource: { buffer: this.linesBuffer } },
      ],
    });
    this.drawPass(this.warpPipeline, this.warpBindGroup, frame.target);
  }

  /** Uploads lines (cached by features/settings) and the frame uniforms. */
  private writeFrameData(frame: MorphFrame): void {
    const { project, a, b, t, canvasWidth, canvasHeight } = frame;
    const settings = project.algorithmSettings.beierNeely;

    const count = this.syncLines(project, settings);

    const projBox = computeProjBox(
      project,
      canvasWidth,
      canvasHeight,
      frame.contentRect,
    );
    const ta = computeUvTransform(
      project.canvas.width,
      project.canvas.height,
      a.width,
      a.height,
      "contain",
    );
    const tb = computeUvTransform(
      project.canvas.width,
      project.canvas.height,
      b.width,
      b.height,
      "contain",
    );
    this.uData.set(projBox, 0);
    this.uData.set([ta.scaleX, ta.scaleY, ta.offsetX, ta.offsetY], 4);
    this.uData.set([tb.scaleX, tb.scaleY, tb.offsetX, tb.offsetY], 8);
    this.uData.set([t, count, frame.dissolveT ?? t, 0], 12);
    this.uData.set([settings.a, settings.b, settings.p, 0], 16);
    this.device.queue.writeBuffer(this.uBuffer, 0, this.uData);
  }

  private drawPass(
    pipeline: GPURenderPipeline,
    bindGroup: GPUBindGroup,
    target: GPUTextureView,
  ): void {
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
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.linesBuffer.destroy();
    this.uBuffer.destroy();
  }

  /**
   * Rebuild + upload the control lines when features or the line-affecting
   * settings change. `project.features` is replaced on every edit (immutable
   * store), so reference identity catches drags, adds, removes and toggles.
   * Returns the uploaded line count.
   */
  private syncLines(
    project: MorphProject,
    settings: BeierNeelySettings,
  ): number {
    const settingsKey = settingsSignature(settings);
    if (
      project.features === this.cachedFeatures &&
      settingsKey === this.cachedSettingsKey
    ) {
      return this.lineCount;
    }
    this.cachedFeatures = project.features;
    this.cachedSettingsKey = settingsKey;

    const lines = buildMorphLines(project.features, settings);
    const count = Math.min(lines.length, MAX_LINES);
    for (let i = 0; i < count; i++) {
      writeLine(this.lineScratch, i, lines[i]);
    }
    this.lineCount = count;
    if (count > 0) {
      this.device.queue.writeBuffer(
        this.linesBuffer,
        0,
        this.lineScratch,
        0,
        count * FLOATS_PER_LINE,
      );
      recordRenderDiagnostic("beierGeometryUploads");
    }
    return count;
  }
}

/** Packs a MorphLine into the GPU layout (a:vec4, b:vec4, params:vec4). */
function writeLine(scratch: Float32Array, i: number, line: MorphLine): void {
  const o = i * FLOATS_PER_LINE;
  scratch[o] = line.a0.x;
  scratch[o + 1] = line.a0.y;
  scratch[o + 2] = line.a1.x;
  scratch[o + 3] = line.a1.y;
  scratch[o + 4] = line.b0.x;
  scratch[o + 5] = line.b0.y;
  scratch[o + 6] = line.b1.x;
  scratch[o + 7] = line.b1.y;
  scratch[o + 8] = line.weight;
  scratch[o + 9] = line.falloff;
  scratch[o + 10] = 0;
  scratch[o + 11] = 0;
}

/** Project content box in canvas UV space: [x0, y0, w, h] (letterboxed aspect). */
function computeProjBox(
  project: MorphProject,
  canvasWidth: number,
  canvasHeight: number,
  contentRect?: Rect,
): [number, number, number, number] {
  const aspect = project.canvas.width / project.canvas.height;
  const rect = contentRect ?? containRect(canvasWidth, canvasHeight, aspect);
  return [
    rect.x / canvasWidth,
    rect.y / canvasHeight,
    rect.width / canvasWidth,
    rect.height / canvasHeight,
  ];
}

/** Key over settings that change the line set (a/b/p go straight to uniforms). */
function settingsSignature(s: BeierNeelySettings): string {
  return [s.samplePolylines, s.maxLines].join("|");
}
