import { computeUvTransform } from "@/lib/image/imagePlacement";
import { containRect, type Rect } from "@/lib/viewport/projectSpace";
import { createLinearSampler } from "@/morph/gpu/textures";
import {
  WARP_MAP_FORMAT,
  type MorphBackend,
  type MorphFrame,
} from "@/morph/algorithms/MorphBackend";
import type { FeaturePair, MorphProject, TpsSettings } from "@/morph/model";
import {
  collectTpsLandmarks,
  MAX_TPS_LANDMARKS,
  type TpsLandmarks,
} from "./collectLandmarks";
import { solveTps, type TpsCoefficients } from "./solveTps";
import tpsWarpWgsl from "./tpsWarp.wgsl?raw";
import { recordRenderDiagnostic } from "../renderDiagnostics";

/** Geometry t is quantized to this many steps so the LRU cache hits while scrubbing. */
const T_STEPS = 256;
/** Cap of cached solved frames (PRD §10.4 "cache LRU par t arrondi"). */
const CACHE_CAP = 64;
/** TPS needs ≥ 3 landmarks for a non-degenerate affine block; below that = identity. */
const MIN_LANDMARKS = 3;

type FrameSolve = { midToA: TpsCoefficients; midToB: TpsCoefficients };

/**
 * Thin-Plate Spline morphing (PRD §10.4). Per frame the warps mid→A and mid→B
 * are solved on the CPU (cached by rounded t) and uploaded as storage buffers;
 * a single fullscreen pass backward-warps and dissolves both images.
 */
export class TpsBackend implements MorphBackend {
  readonly id = "thin-plate-spline" as const;

  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly pipeline: GPURenderPipeline;
  private readonly warpPipeline: GPURenderPipeline;
  private warpBindGroup: GPUBindGroup | null = null;

  private readonly pointsBuffer: GPUBuffer;
  private readonly coeffsABuffer: GPUBuffer;
  private readonly coeffsBBuffer: GPUBuffer;
  private readonly uBuffer: GPUBuffer;
  private readonly affBuffer: GPUBuffer;

  private readonly pointScratch = new Float32Array(MAX_TPS_LANDMARKS * 4);
  private readonly coeffScratchA = new Float32Array(MAX_TPS_LANDMARKS * 4);
  private readonly coeffScratchB = new Float32Array(MAX_TPS_LANDMARKS * 4);
  private readonly uData = new Float32Array(16);
  private readonly affData = new Float32Array(16);

  // Landmark cache + per-t solve cache (invalidated together).
  private landmarks: TpsLandmarks | null = null;
  private cachedFeatures: FeaturePair[] | null = null;
  private cachedSettingsKey = "";
  private readonly cache = new Map<number, FrameSolve>();

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.sampler = createLinearSampler(device);

    const module = device.createShaderModule({ code: tpsWarpWgsl });
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

    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const uniform = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.pointsBuffer = device.createBuffer({
      size: this.pointScratch.byteLength,
      usage: storage,
    });
    this.coeffsABuffer = device.createBuffer({
      size: this.coeffScratchA.byteLength,
      usage: storage,
    });
    this.coeffsBBuffer = device.createBuffer({
      size: this.coeffScratchB.byteLength,
      usage: storage,
    });
    this.uBuffer = device.createBuffer({
      size: this.uData.byteLength,
      usage: uniform,
    });
    this.affBuffer = device.createBuffer({
      size: this.affData.byteLength,
      usage: uniform,
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
        { binding: 4, resource: { buffer: this.pointsBuffer } },
        { binding: 5, resource: { buffer: this.coeffsABuffer } },
        { binding: 6, resource: { buffer: this.coeffsBBuffer } },
        { binding: 7, resource: { buffer: this.affBuffer } },
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
        { binding: 4, resource: { buffer: this.pointsBuffer } },
        { binding: 5, resource: { buffer: this.coeffsABuffer } },
        { binding: 6, resource: { buffer: this.coeffsBBuffer } },
        { binding: 7, resource: { buffer: this.affBuffer } },
      ],
    });
    this.drawPass(this.warpPipeline, this.warpBindGroup, frame.target);
  }

  /** Solves the frame (cached by t) and uploads landmarks/coeffs/uniforms. */
  private writeFrameData(frame: MorphFrame): void {
    const { project, a, b, t, canvasWidth, canvasHeight } = frame;
    const settings = project.algorithmSettings.thinPlateSpline;

    const landmarks = this.syncLandmarks(project, settings);
    const valid = landmarks.count >= MIN_LANDMARKS;

    if (valid) {
      const solve = this.solveForT(landmarks, settings.lambda, t);
      this.writePoints(solve.midToA.points, landmarks.count);
      this.writeCoeffs(this.coeffScratchA, solve.midToA, landmarks.count);
      this.writeCoeffs(this.coeffScratchB, solve.midToB, landmarks.count);
      this.affData.set([...solve.midToA.affineX, 0], 0);
      this.affData.set([...solve.midToA.affineY, 0], 4);
      this.affData.set([...solve.midToB.affineX, 0], 8);
      this.affData.set([...solve.midToB.affineY, 0], 12);

      const used = landmarks.count * 4;
      this.device.queue.writeBuffer(
        this.pointsBuffer,
        0,
        this.pointScratch,
        0,
        used,
      );
      this.device.queue.writeBuffer(
        this.coeffsABuffer,
        0,
        this.coeffScratchA,
        0,
        used,
      );
      this.device.queue.writeBuffer(
        this.coeffsBBuffer,
        0,
        this.coeffScratchB,
        0,
        used,
      );
      this.device.queue.writeBuffer(this.affBuffer, 0, this.affData);
    }

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
    this.uData.set(
      [frame.dissolveT ?? t, landmarks.count, valid ? 1 : 0, 0],
      12,
    );
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
    this.pointsBuffer.destroy();
    this.coeffsABuffer.destroy();
    this.coeffsBBuffer.destroy();
    this.uBuffer.destroy();
    this.affBuffer.destroy();
  }

  /**
   * Recollect landmarks (and clear the solve cache) when features or settings
   * change. `project.features` is replaced on every edit (immutable store), so
   * reference identity catches point drags, adds, removes and toggles.
   */
  private syncLandmarks(
    project: MorphProject,
    settings: TpsSettings,
  ): TpsLandmarks {
    const settingsKey = settingsSignature(settings);
    if (
      this.landmarks &&
      project.features === this.cachedFeatures &&
      settingsKey === this.cachedSettingsKey
    ) {
      return this.landmarks;
    }
    this.cachedFeatures = project.features;
    this.cachedSettingsKey = settingsKey;
    this.cache.clear();
    this.landmarks = collectTpsLandmarks(project.features, settings);
    return this.landmarks;
  }

  /** Solve mid→A and mid→B at (quantized) t, memoized in the LRU cache. */
  private solveForT(
    landmarks: TpsLandmarks,
    lambda: number,
    t: number,
  ): FrameSolve {
    const key = Math.round(t * T_STEPS);
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit); // mark most-recently used
      return hit;
    }

    const tq = key / T_STEPS;
    const n = landmarks.count;
    const mid = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) {
      mid[i] = landmarks.a[i] * (1 - tq) + landmarks.b[i] * tq;
    }
    const solve: FrameSolve = {
      // Two independent systems: intermediate→A and intermediate→B.
      midToA: solveTps(mid, landmarks.a.subarray(0, n * 2), lambda),
      midToB: solveTps(mid, landmarks.b.subarray(0, n * 2), lambda),
    };
    recordRenderDiagnostic("tpsSolves");
    recordRenderDiagnostic("tpsSolves");

    this.cache.set(key, solve);
    if (this.cache.size > CACHE_CAP) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return solve;
  }

  private writePoints(mid: Float32Array, count: number): void {
    for (let i = 0; i < count; i++) {
      this.pointScratch[i * 4] = mid[i * 2];
      this.pointScratch[i * 4 + 1] = mid[i * 2 + 1];
    }
  }

  private writeCoeffs(
    scratch: Float32Array,
    c: TpsCoefficients,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      scratch[i * 4] = c.weightsX[i];
      scratch[i * 4 + 1] = c.weightsY[i];
    }
  }
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

/** Key over settings that change the landmark set or the solve (`lambda`). */
function settingsSignature(s: TpsSettings): string {
  return [
    s.lambda,
    s.borderAnchors,
    s.borderAnchorCount,
    s.samplePolylines,
    s.polylineSampleSpacing,
  ].join("|");
}
