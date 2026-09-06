import type { LayerId, Vec2 } from "@/morph/model";
import brushWgsl from "./brush.wgsl?raw";
import {
  appendStamps,
  initialStampPath,
  STAMP_SPACING_FACTOR,
  type StampPathState,
} from "./strokeStamps";

/** Brush options (PRD M11 lot 3). `diameter` is a fraction of min(mask w, h). */
export type BrushStrokeParams = {
  diameter: number;
  hardness: number;
  strength: number;
  erase: boolean;
};

export type BrushStrokeResult = {
  layerId: LayerId;
  width: number;
  height: number;
  /** Raw R8 rows of the combined (committed ∘ stroke) mask. */
  bytes: Uint8Array;
};

type MaskTexture = {
  texture: GPUTexture;
  view: GPUTextureView;
};

const MASK_FORMAT: GPUTextureFormat = "r8unorm";

const maxBlend: GPUBlendState = {
  color: { operation: "max", srcFactor: "one", dstFactor: "one" },
  alpha: { operation: "max", srcFactor: "one", dstFactor: "one" },
};

/**
 * GPU paint engine for the mask brush (PRD M11 lot 3), on the shared device.
 * Holds one authoring session — the active layer's painted mask:
 *
 * - `committed` mirrors the layer's stored mask bytes ({@link setBase});
 * - during a stroke, stamps accumulate in a separate `stroke` buffer with MAX
 *   blending (a fast or overlapping stroke plateaus at `strength`);
 * - `display` always shows committed ∘ stroke and is what the pane tint samples;
 * - {@link endStroke} composes the stroke onto the mask ONCE (add, or subtract
 *   for the eraser) and reads the result back for the model/undo-free commit.
 */
export class BrushEngine {
  private readonly device: GPUDevice;
  private readonly onChange: () => void;
  private readonly stampPipeline: GPURenderPipeline;
  private readonly combinePipeline: GPURenderPipeline;
  private readonly stampUniform: GPUBuffer;
  private readonly combineUniform: GPUBuffer;
  private readonly stampBindGroup: GPUBindGroup;
  private combineBindGroup: GPUBindGroup | null = null;

  private committed: MaskTexture | null = null;
  private stroke: MaskTexture | null = null;
  private display: MaskTexture | null = null;
  private width = 0;
  private height = 0;
  private layerId: LayerId | null = null;

  private instanceBuffer: GPUBuffer | null = null;
  private instanceCapacity = 0;

  private activeStroke: {
    erase: boolean;
    path: StampPathState;
    spacingPx: number;
  } | null = null;

  constructor(device: GPUDevice, onChange: () => void = () => {}) {
    this.device = device;
    this.onChange = onChange;
    const module = device.createShaderModule({ code: brushWgsl });

    this.stampPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vsStamp",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "instance",
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fsStamp",
        targets: [{ format: MASK_FORMAT, blend: maxBlend }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.combinePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vsCombine" },
      fragment: {
        module,
        entryPoint: "fsCombine",
        targets: [{ format: MASK_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.stampUniform = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.combineUniform = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.stampBindGroup = device.createBindGroup({
      layout: this.stampPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.stampUniform } }],
    });
  }

  /** Layer whose painted mask is loaded in the session (null = none). */
  baseLayerId(): LayerId | null {
    return this.layerId;
  }

  size(): { width: number; height: number } | null {
    return this.committed ? { width: this.width, height: this.height } : null;
  }

  /** The committed ∘ live-stroke mask, for the pane tint. */
  maskView(): GPUTextureView | null {
    return this.display?.view ?? null;
  }

  strokeInProgress(): boolean {
    return this.activeStroke !== null;
  }

  /**
   * Loads a layer's stored mask bytes (or a blank mask) as the session base.
   * Ignored mid-stroke so a racing model update cannot clobber the stroke.
   */
  setBase(
    layerId: LayerId,
    width: number,
    height: number,
    bytes: Uint8Array | null,
  ): void {
    if (this.activeStroke) return;
    this.syncTextures(width, height);
    this.layerId = layerId;
    if (bytes) {
      this.device.queue.writeTexture(
        { texture: this.committed!.texture },
        bytes,
        { bytesPerRow: width, rowsPerImage: height },
        [width, height],
      );
    } else {
      this.clearTexture(this.committed!);
    }
    this.clearTexture(this.stroke!);
    this.refreshDisplay(false);
    this.onChange();
  }

  /** Starts a stroke on the current base. False when no base is loaded. */
  beginStroke(params: BrushStrokeParams): boolean {
    if (!this.committed || this.activeStroke) return false;
    const diameterPx = Math.max(
      1,
      params.diameter * Math.min(this.width, this.height),
    );
    this.device.queue.writeBuffer(
      this.stampUniform,
      0,
      new Float32Array([
        this.width,
        this.height,
        diameterPx / 2,
        Math.min(Math.max(params.hardness, 0), 1),
        Math.min(Math.max(params.strength, 0), 1),
        0,
        0,
        0,
      ]),
    );
    this.clearTexture(this.stroke!);
    this.activeStroke = {
      erase: params.erase,
      path: initialStampPath(),
      spacingPx: Math.max(1, diameterPx * STAMP_SPACING_FACTOR),
    };
    return true;
  }

  /** Stamps the incoming project-space points (0..1) along the stroke path. */
  extendStroke(points: Vec2[]): void {
    const stroke = this.activeStroke;
    if (!stroke || points.length === 0) return;
    const px = points.map((p) => ({
      x: Math.min(Math.max(p.x, 0), 1) * this.width,
      y: Math.min(Math.max(p.y, 0), 1) * this.height,
    }));
    const { stamps, state } = appendStamps(stroke.path, px, stroke.spacingPx);
    stroke.path = state;
    if (stamps.length === 0) return;

    const data = new Float32Array(stamps.length * 2);
    stamps.forEach((s, i) => {
      data[i * 2] = s.x;
      data[i * 2 + 1] = s.y;
    });
    this.writeInstances(data);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.stroke!.view, loadOp: "load", storeOp: "store" },
      ],
    });
    pass.setPipeline(this.stampPipeline);
    pass.setBindGroup(0, this.stampBindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer!);
    pass.draw(6, stamps.length);
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    this.refreshDisplay(stroke.erase);
    this.onChange();
  }

  /**
   * Composes the stroke onto the committed mask (once — no over-deposit) and
   * reads the merged bytes back for the model. Null when no stroke was active.
   */
  async endStroke(): Promise<BrushStrokeResult | null> {
    const stroke = this.activeStroke;
    if (!stroke || !this.committed || this.layerId === null) return null;
    this.refreshDisplay(stroke.erase);

    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToTexture(
      { texture: this.display!.texture },
      { texture: this.committed.texture },
      [this.width, this.height],
    );
    this.device.queue.submit([encoder.finish()]);

    this.activeStroke = null;
    this.clearTexture(this.stroke!);
    const bytes = await this.readback();
    this.onChange();
    return {
      layerId: this.layerId,
      width: this.width,
      height: this.height,
      bytes,
    };
  }

  /** Drops the in-progress stroke, restoring the committed mask. */
  cancelStroke(): void {
    if (!this.activeStroke) return;
    this.activeStroke = null;
    this.clearTexture(this.stroke!);
    this.refreshDisplay(false);
    this.onChange();
  }

  dispose(): void {
    this.committed?.texture.destroy();
    this.stroke?.texture.destroy();
    this.display?.texture.destroy();
    this.instanceBuffer?.destroy();
    this.stampUniform.destroy();
    this.combineUniform.destroy();
  }

  /** display = committed (+|-) stroke. Runs after every visual change. */
  private refreshDisplay(erase: boolean): void {
    this.device.queue.writeBuffer(
      this.combineUniform,
      0,
      new Float32Array([erase ? 1 : 0, 0, 0, 0]),
    );
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.display!.view, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(this.combinePipeline);
    pass.setBindGroup(0, this.combineBindGroup!);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private syncTextures(width: number, height: number): void {
    if (this.committed && this.width === width && this.height === height) {
      return;
    }
    this.committed?.texture.destroy();
    this.stroke?.texture.destroy();
    this.display?.texture.destroy();
    this.width = width;
    this.height = height;

    const make = (usage: number): MaskTexture => {
      const texture = this.device.createTexture({
        size: [width, height],
        format: MASK_FORMAT,
        usage,
      });
      return { texture, view: texture.createView() };
    };
    this.committed = make(
      GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    );
    this.stroke = make(
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    );
    this.display = make(
      GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    );
    this.combineBindGroup = this.device.createBindGroup({
      layout: this.combinePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.committed.view },
        { binding: 1, resource: this.stroke.view },
        { binding: 2, resource: { buffer: this.combineUniform } },
      ],
    });
  }

  private clearTexture(target: MaskTexture): void {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private writeInstances(data: Float32Array): void {
    const bytes = data.byteLength;
    if (!this.instanceBuffer || this.instanceCapacity < bytes) {
      this.instanceBuffer?.destroy();
      this.instanceCapacity = 1 << Math.ceil(Math.log2(Math.max(bytes, 256)));
      this.instanceBuffer = this.device.createBuffer({
        label: "brush-stamps",
        size: this.instanceCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  /** Reads the display texture back as tight R8 rows. */
  private async readback(): Promise<Uint8Array> {
    const paddedRow = Math.ceil(this.width / 256) * 256;
    const buffer = this.device.createBuffer({
      size: paddedRow * this.height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: this.display!.texture },
      { buffer, bytesPerRow: paddedRow, rowsPerImage: this.height },
      [this.width, this.height],
    );
    this.device.queue.submit([encoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) {
      out.set(
        mapped.subarray(y * paddedRow, y * paddedRow + this.width),
        y * this.width,
      );
    }
    buffer.unmap();
    buffer.destroy();
    return out;
  }
}
