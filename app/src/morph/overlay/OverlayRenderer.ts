import { triangulatePolygon } from "@/lib/geometry/triangulatePolygon";
import overlayWgsl from "./overlay.wgsl?raw";
import { packFrameUniform, type OverlayFrame } from "./overlayTransform";
import type { OverlayScene } from "./scene";

const FILL_STRIDE = 6; // pos.xy + rgba
const LINE_STRIDE = 9; // a.xy + b.xy + rgba + width
const DOT_STRIDE = 14; // pos.xy + fill(4) + stroke(4) + params(radius,strokeW,_,_)

const premultBlend: GPUBlendState = {
  color: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
};

/** A vertex/instance buffer that grows on demand and is rewritten each frame. */
class DynamicBuffer {
  private readonly device: GPUDevice;
  private readonly label: string;
  private buffer: GPUBuffer | null = null;
  private capacity = 0;

  constructor(device: GPUDevice, label: string) {
    this.device = device;
    this.label = label;
  }

  /** Uploads `data` (sized to `floatCount` floats), growing the GPU buffer if needed. */
  write(data: Float32Array, floatCount: number): GPUBuffer | null {
    if (floatCount === 0) return null;
    const bytes = floatCount * 4;
    if (!this.buffer || this.capacity < bytes) {
      this.buffer?.destroy();
      this.capacity = 1 << Math.ceil(Math.log2(Math.max(bytes, 256)));
      this.buffer = this.device.createBuffer({
        label: this.label,
        size: this.capacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(this.buffer, 0, data, 0, floatCount);
    return this.buffer;
  }

  dispose(): void {
    this.buffer?.destroy();
    this.buffer = null;
  }
}

/**
 * Métier-agnostic GPU overlay renderer (PRD M11). Consumes an {@link OverlayScene}
 * of project-space primitives and draws it onto a transparent canvas over the
 * media viewport, on the shared M10 device. Three pipelines share one `Frame`
 * uniform and one render pass: polygon fills (triangulated), SDF capsule lines
 * (instanced), SDF dots (instanced). Buffers are rebuilt each frame — overlay
 * primitive counts are modest (handles, a dense grid is a few thousand lines)
 * and this is exactly the work the GPU replaces the SVG jank with.
 */
export class OverlayRenderer {
  private readonly device: GPUDevice;
  private readonly fillPipeline: GPURenderPipeline;
  private readonly linePipeline: GPURenderPipeline;
  private readonly dotPipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private readonly fillBuffer: DynamicBuffer;
  private readonly lineBuffer: DynamicBuffer;
  private readonly dotBuffer: DynamicBuffer;

  // Reused CPU staging arrays (grow-only) to avoid per-frame allocation.
  private fillData = new Float32Array(0);
  private lineData = new Float32Array(0);
  private dotData = new Float32Array(0);

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    const module = device.createShaderModule({ code: overlayWgsl });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
    const layout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });
    const target: GPUColorTargetState = { format, blend: premultBlend };

    this.fillPipeline = device.createRenderPipeline({
      layout,
      vertex: {
        module,
        entryPoint: "vs_fill",
        buffers: [
          {
            arrayStride: FILL_STRIDE * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fs_fill", targets: [target] },
      primitive: { topology: "triangle-list" },
    });

    this.linePipeline = device.createRenderPipeline({
      layout,
      vertex: {
        module,
        entryPoint: "vs_line",
        buffers: [
          {
            arrayStride: LINE_STRIDE * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32x4" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fs_line", targets: [target] },
      primitive: { topology: "triangle-list" },
    });

    this.dotPipeline = device.createRenderPipeline({
      layout,
      vertex: {
        module,
        entryPoint: "vs_dot",
        buffers: [
          {
            arrayStride: DOT_STRIDE * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x4" },
              { shaderLocation: 2, offset: 24, format: "float32x4" },
              { shaderLocation: 3, offset: 40, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fs_dot", targets: [target] },
      primitive: { topology: "triangle-list" },
    });

    this.uniformBuffer = device.createBuffer({
      size: 8 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    this.fillBuffer = new DynamicBuffer(device, "overlay-fills");
    this.lineBuffer = new DynamicBuffer(device, "overlay-lines");
    this.dotBuffer = new DynamicBuffer(device, "overlay-dots");
  }

  render(
    target: GPUTextureView,
    scene: OverlayScene,
    frame: OverlayFrame,
  ): void {
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      packFrameUniform(frame),
    );

    const fillFloats = this.packFills(scene);
    const lineFloats = this.packLines(scene);
    const dotFloats = this.packDots(scene);

    const fillBuf = this.fillBuffer.write(this.fillData, fillFloats);
    const lineBuf = this.lineBuffer.write(this.lineData, lineFloats);
    const dotBuf = this.dotBuffer.write(this.dotData, dotFloats);

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
    pass.setBindGroup(0, this.bindGroup);

    if (fillBuf) {
      pass.setPipeline(this.fillPipeline);
      pass.setVertexBuffer(0, fillBuf);
      pass.draw(fillFloats / FILL_STRIDE);
    }
    if (lineBuf) {
      pass.setPipeline(this.linePipeline);
      pass.setVertexBuffer(0, lineBuf);
      pass.draw(6, lineFloats / LINE_STRIDE);
    }
    if (dotBuf) {
      pass.setPipeline(this.dotPipeline);
      pass.setVertexBuffer(0, dotBuf);
      pass.draw(6, dotFloats / DOT_STRIDE);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private ensure(
    field: "fillData" | "lineData" | "dotData",
    floats: number,
  ): Float32Array {
    if (this[field].length < floats) this[field] = new Float32Array(floats);
    return this[field];
  }

  private packFills(scene: OverlayScene): number {
    const triangulated = scene.fills.map((fill) =>
      triangulatePolygon(fill.points),
    );
    let count = 0;
    for (const tris of triangulated) {
      count += tris.length * FILL_STRIDE;
    }
    if (count === 0) return 0;
    const out = this.ensure("fillData", count);
    let o = 0;
    for (const [index, fill] of scene.fills.entries()) {
      const tris = triangulated[index];
      const [r, g, b, a] = fill.color;
      for (const idx of tris) {
        const p = fill.points[idx];
        out[o++] = p.x;
        out[o++] = p.y;
        out[o++] = r;
        out[o++] = g;
        out[o++] = b;
        out[o++] = a;
      }
    }
    return o;
  }

  private packLines(scene: OverlayScene): number {
    const count = scene.lines.length * LINE_STRIDE;
    if (count === 0) return 0;
    const out = this.ensure("lineData", count);
    let o = 0;
    for (const line of scene.lines) {
      const [r, g, b, a] = line.color;
      out[o++] = line.a.x;
      out[o++] = line.a.y;
      out[o++] = line.b.x;
      out[o++] = line.b.y;
      out[o++] = r;
      out[o++] = g;
      out[o++] = b;
      out[o++] = a;
      out[o++] = line.widthPx;
    }
    return o;
  }

  private packDots(scene: OverlayScene): number {
    const count = scene.dots.length * DOT_STRIDE;
    if (count === 0) return 0;
    const out = this.ensure("dotData", count);
    let o = 0;
    for (const dot of scene.dots) {
      out[o++] = dot.pos.x;
      out[o++] = dot.pos.y;
      out[o++] = dot.fill[0];
      out[o++] = dot.fill[1];
      out[o++] = dot.fill[2];
      out[o++] = dot.fill[3];
      out[o++] = dot.stroke[0];
      out[o++] = dot.stroke[1];
      out[o++] = dot.stroke[2];
      out[o++] = dot.stroke[3];
      out[o++] = dot.radiusPx;
      out[o++] = dot.strokeWidthPx;
      out[o++] = 0;
      out[o++] = 0;
    }
    return o;
  }

  dispose(): void {
    this.uniformBuffer.destroy();
    this.fillBuffer.dispose();
    this.lineBuffer.dispose();
    this.dotBuffer.dispose();
  }
}
