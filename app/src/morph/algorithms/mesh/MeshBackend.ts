import { computeUvTransform } from "@/lib/image/imagePlacement";
import { containRect, type Rect } from "@/lib/viewport/projectSpace";
import { createLinearSampler } from "@/morph/gpu/textures";
import { buildMesh } from "@/morph/mesh/buildMesh";
import type { FeaturePair, MorphProject } from "@/morph/model";
import {
  WARP_MAP_FORMAT,
  type GpuImageSlot,
  type MorphBackend,
  type MorphFrame,
} from "@/morph/algorithms/MorphBackend";
import meshWarpWgsl from "./meshWarp.wgsl?raw";
import meshBlendWgsl from "./meshBlend.wgsl?raw";
import { recordRenderDiagnostic } from "../renderDiagnostics";

const INTERMEDIATE_FORMAT: GPUTextureFormat = "rgba8unorm";
const FLOATS_PER_VERTEX = 8; // posA.xy, posB.xy, uvA.xy, uvB.xy

/** rgba8unorm intermediate target the warp passes render into. */
type WarpTarget = { texture: GPUTexture; view: GPUTextureView };

/**
 * Mesh / triangulation morphing (PRD §10.3, Option A — render pipeline).
 *
 * Per frame: warp image A and image B to the intermediate shape at t (two
 * render passes into intermediate textures), then blend them. The mesh and its
 * per-vertex UVs are rebuilt only when features or image sizes change; t alone
 * just updates the uniform (positionT is interpolated in the vertex shader).
 */
export class MeshBackend implements MorphBackend {
  readonly id = "mesh" as const;

  private readonly device: GPUDevice;
  private readonly sampler: GPUSampler;
  private readonly warpPipeline: GPURenderPipeline;
  private readonly mapPipeline: GPURenderPipeline;
  private readonly blendPipeline: GPURenderPipeline;
  private readonly warpUniformA: GPUBuffer;
  private readonly warpUniformB: GPUBuffer;
  private readonly mapUniform: GPUBuffer;
  private readonly blendUniform: GPUBuffer;
  private readonly warpData = new Float32Array(8); // vec4 projToClip + vec4 params
  private readonly blendData = new Float32Array(4);

  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;

  // Cache keys to decide when geometry must be rebuilt.
  private cachedFeatures: FeaturePair[] | null = null;
  private cachedDims = "";

  private warpA: WarpTarget | null = null;
  private warpB: WarpTarget | null = null;
  private texW = 0;
  private texH = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    this.sampler = createLinearSampler(device);

    const warpModule = device.createShaderModule({ code: meshWarpWgsl });
    this.warpPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: warpModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32x2" },
              { shaderLocation: 3, offset: 24, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module: warpModule,
        entryPoint: "fs",
        targets: [{ format: INTERMEDIATE_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.mapPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: warpModule,
        entryPoint: "vs_map",
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32x2" },
              { shaderLocation: 3, offset: 24, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module: warpModule,
        entryPoint: "fs_map",
        targets: [{ format: WARP_MAP_FORMAT }],
      },
      primitive: { topology: "triangle-list" },
    });

    const blendModule = device.createShaderModule({ code: meshBlendWgsl });
    this.blendPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: blendModule, entryPoint: "vs" },
      fragment: {
        module: blendModule,
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    const warpBytes = this.warpData.byteLength;
    this.warpUniformA = device.createBuffer({
      size: warpBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.warpUniformB = device.createBuffer({
      size: warpBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.mapUniform = device.createBuffer({
      size: warpBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.blendUniform = device.createBuffer({
      size: this.blendData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  renderFrame(frame: MorphFrame): void {
    const { project, a, b, t, target, canvasWidth, canvasHeight } = frame;

    this.syncGeometry(project, a, b);
    this.syncIntermediates(canvasWidth, canvasHeight);

    const projToClip = computeProjToClip(
      project,
      canvasWidth,
      canvasHeight,
      frame.contentRect,
    );

    // Two warp uniforms so both passes read stable values within one submit.
    this.warpData.set(projToClip, 0);
    this.warpData.set([t, 0, 0, 0], 4);
    this.device.queue.writeBuffer(this.warpUniformA, 0, this.warpData);
    this.warpData.set([t, 1, 0, 0], 4);
    this.device.queue.writeBuffer(this.warpUniformB, 0, this.warpData);

    this.blendData.set([frame.dissolveT ?? t, 0, 0, 0], 0);
    this.device.queue.writeBuffer(this.blendUniform, 0, this.blendData);

    const encoder = this.device.createCommandEncoder();
    this.warpPass(encoder, this.warpA!, a.view, this.warpUniformA);
    this.warpPass(encoder, this.warpB!, b.view, this.warpUniformB);
    this.blendPass(encoder, target);
    this.device.queue.submit([encoder.finish()]);
  }

  /** A-side warp map for painted-mask advection — see MorphBackend. */
  renderWarpMap(frame: MorphFrame): void {
    const { project, a, b, t, target, canvasWidth, canvasHeight } = frame;
    this.syncGeometry(project, a, b);

    const projToClip = computeProjToClip(
      project,
      canvasWidth,
      canvasHeight,
      frame.contentRect,
    );
    this.warpData.set(projToClip, 0);
    this.warpData.set([t, 0, 0, 0], 4);
    this.device.queue.writeBuffer(this.mapUniform, 0, this.warpData);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target,
          // Uncovered pixels fall back to (0,0): with border anchors the mesh
          // covers the whole project box, so this only reaches letterbox areas
          // the compositor already discards.
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    if (this.indexCount > 0 && this.vertexBuffer && this.indexBuffer) {
      pass.setPipeline(this.mapPipeline);
      pass.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.mapPipeline.getBindGroupLayout(0),
          entries: [{ binding: 2, resource: { buffer: this.mapUniform } }],
        }),
      );
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, "uint32");
      pass.drawIndexed(this.indexCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose(): void {
    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.warpA?.texture.destroy();
    this.warpB?.texture.destroy();
    this.warpUniformA.destroy();
    this.warpUniformB.destroy();
    this.mapUniform.destroy();
    this.blendUniform.destroy();
  }

  /** One warp pass: rasterize the mesh at shape(t), sampling one image. */
  private warpPass(
    encoder: GPUCommandEncoder,
    out: WarpTarget,
    image: GPUTextureView,
    uniform: GPUBuffer,
  ): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: out.view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    if (this.indexCount > 0 && this.vertexBuffer && this.indexBuffer) {
      pass.setPipeline(this.warpPipeline);
      pass.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.warpPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: image },
            { binding: 1, resource: this.sampler },
            { binding: 2, resource: { buffer: uniform } },
          ],
        }),
      );
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, "uint32");
      pass.drawIndexed(this.indexCount);
    }
    pass.end();
  }

  /** Dissolve the two warped images into the canvas target. */
  private blendPass(encoder: GPUCommandEncoder, target: GPUTextureView): void {
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
    pass.setPipeline(this.blendPipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: this.blendPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.warpA!.view },
          { binding: 1, resource: this.warpB!.view },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: { buffer: this.blendUniform } },
        ],
      }),
    );
    pass.draw(3);
    pass.end();
  }

  /** Rebuild mesh + vertex/index buffers when features or image sizes change. */
  private syncGeometry(
    project: MorphProject,
    a: GpuImageSlot,
    b: GpuImageSlot,
  ): void {
    const dims = `${a.width}x${a.height}|${b.width}x${b.height}`;
    if (project.features === this.cachedFeatures && dims === this.cachedDims) {
      return;
    }
    this.cachedFeatures = project.features;
    this.cachedDims = dims;
    recordRenderDiagnostic("meshGeometryRebuilds");

    const mesh = buildMesh(project.features, project.algorithmSettings.mesh);
    const n = mesh.pointsMid.length / 2;

    // Place each image (contain) into Project Space, like the editor panes.
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

    const verts = new Float32Array(n * FLOATS_PER_VERTEX);
    for (let i = 0; i < n; i++) {
      const ax = mesh.pointsA[i * 2];
      const ay = mesh.pointsA[i * 2 + 1];
      const bx = mesh.pointsB[i * 2];
      const by = mesh.pointsB[i * 2 + 1];
      const o = i * FLOATS_PER_VERTEX;
      verts[o] = ax;
      verts[o + 1] = ay;
      verts[o + 2] = bx;
      verts[o + 3] = by;
      verts[o + 4] = ax * ta.scaleX + ta.offsetX;
      verts[o + 5] = ay * ta.scaleY + ta.offsetY;
      verts[o + 6] = bx * tb.scaleX + tb.offsetX;
      verts[o + 7] = by * tb.scaleY + tb.offsetY;
    }

    this.vertexBuffer?.destroy();
    this.indexBuffer?.destroy();
    this.indexCount = mesh.triangles.length;

    if (this.indexCount === 0) {
      this.vertexBuffer = null;
      this.indexBuffer = null;
      return;
    }

    this.vertexBuffer = this.device.createBuffer({
      size: verts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, verts);

    // Index buffer size must be a multiple of 4 (already, Uint32).
    this.indexBuffer = this.device.createBuffer({
      size: mesh.triangles.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, mesh.triangles);
    recordRenderDiagnostic("meshGeometryUploads");
  }

  /** (Re)allocate the intermediate textures to match the canvas size. */
  private syncIntermediates(width: number, height: number): void {
    if (this.warpA && this.texW === width && this.texH === height) return;
    this.warpA?.texture.destroy();
    this.warpB?.texture.destroy();
    this.texW = width;
    this.texH = height;
    this.warpA = this.createIntermediate(width, height);
    this.warpB = this.createIntermediate(width, height);
  }

  private createIntermediate(width: number, height: number): WarpTarget {
    const texture = this.device.createTexture({
      size: [width, height],
      format: INTERMEDIATE_FORMAT,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return { texture, view: texture.createView() };
  }
}

/**
 * Project Space [0,1]² → clip space as `pos * scale + offset`. The project is
 * letterboxed (its aspect) inside the canvas — like {@link createProjectSpaceTransform}
 * — and Y is flipped. Returns `[sx, sy, ox, oy]`.
 */
function computeProjToClip(
  project: MorphProject,
  canvasWidth: number,
  canvasHeight: number,
  contentRect?: Rect,
): [number, number, number, number] {
  const aspect = project.canvas.width / project.canvas.height;
  const rect = contentRect ?? containRect(canvasWidth, canvasHeight, aspect);
  const fw = rect.width / canvasWidth;
  const fh = rect.height / canvasHeight;
  const nx0 = rect.x / canvasWidth;
  const ny0 = rect.y / canvasHeight;
  return [2 * fw, -2 * fh, 2 * nx0 - 1, 1 - 2 * ny0];
}
