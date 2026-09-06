import type { Rect } from "@/lib/viewport/projectSpace";
import {
  WARP_MAP_FORMAT,
  type MorphBackend,
  type MorphFrame,
} from "@/morph/algorithms/MorphBackend";
import {
  decodeMaskBytes,
  layerContribution,
  type LayerId,
  type MorphLayer,
  type MorphProject,
  type PaintedMask,
  type RegionFeaturePair,
} from "@/morph/model";
import { GpuMaskRenderer } from "./GpuMaskRenderer";
import { syncRenderTexture, type RenderTexture } from "./renderTexture";

export type LivePaintedMask = { layerId: LayerId; view: GPUTextureView };

export type MaskBind = {
  view: GPUTextureView;
  hasMask: boolean;
  /** Brush-painted mask in project space; dummy view when absent. */
  paintView: GPUTextureView;
  hasPaint: boolean;
  /** A-side warp map advecting the painted mask; dummy view when absent. */
  warpView: GPUTextureView;
  hasWarp: boolean;
};

/** Owns GPU textures for vector, painted and advected layer masks. */
export class MaskTextureCache {
  private readonly device: GPUDevice;
  private readonly gpuRenderer: GpuMaskRenderer;
  private warpMapTarget: RenderTexture | null = null;
  private readonly fallback: RenderTexture;
  private readonly paintedMasks = new Map<
    LayerId,
    { source: PaintedMask; texture: RenderTexture | null }
  >();
  private livePaintedMask: LivePaintedMask | undefined;
  private contentRect: Rect | undefined;

  constructor(device: GPUDevice) {
    this.device = device;
    this.gpuRenderer = new GpuMaskRenderer(device);
    this.fallback = createMaskTexture(device, 1, 1);
    device.queue.writeTexture(
      { texture: this.fallback.texture },
      new Uint8Array([255]),
      {},
      [1, 1],
    );
  }

  fallbackView(): GPUTextureView {
    return this.fallback.view;
  }

  beginFrame(
    project: MorphProject,
    contentRect?: Rect,
    livePaintedMask?: LivePaintedMask,
  ): void {
    this.contentRect = contentRect;
    this.livePaintedMask = livePaintedMask;
    this.prunePaintedMasks(project);
  }

  noMask(): MaskBind {
    return {
      view: this.fallback.view,
      hasMask: false,
      paintView: this.fallback.view,
      hasPaint: false,
      warpView: this.fallback.view,
      hasWarp: false,
    };
  }

  maskFor(
    project: MorphProject,
    layer: MorphLayer,
    t: number,
    width: number,
    height: number,
  ): MaskBind {
    const bind = this.noMask();
    const painted =
      this.livePaintedMask?.layerId === layer.id
        ? this.livePaintedMask.view
        : this.paintedMaskFor(layer);
    if (painted) {
      bind.paintView = painted;
      bind.hasPaint = true;
    }
    if (!layer.mask) return bind;
    const region = project.features.find(
      (feature): feature is RegionFeaturePair =>
        feature.id === layer.mask?.featureId &&
        feature.kind === "region" &&
        feature.enabled,
    );
    if (region) {
      const view =
        layer.mask.mode === "hard"
          ? this.gpuRenderer.renderHard({
              project,
              region,
              t,
              width,
              height,
              contentRect: this.contentRect,
            })
          : this.gpuRenderer.renderFeathered({
              project,
              region,
              t,
              width,
              height,
              feather: layer.mask.feather,
              contentRect: this.contentRect,
            });
      if (view) {
        bind.view = view;
        bind.hasMask = true;
      }
    }
    return bind;
  }

  coverageMaskFor(
    project: MorphProject,
    layer: MorphLayer,
    t: number,
    width: number,
    height: number,
    tauSec?: number,
  ): MaskBind | null {
    const contribution = layerContribution(project, layer, tauSec);
    if (
      contribution.status === "disabled" ||
      contribution.status === "hidden" ||
      contribution.status === "outside-clip" ||
      contribution.status === "no-contribution"
    ) {
      return null;
    }
    if (
      contribution.status === "masked" ||
      this.livePaintedMask?.layerId === layer.id
    ) {
      return this.maskFor(project, layer, t, width, height);
    }
    return this.noMask();
  }

  regionMask(
    project: MorphProject,
    region: RegionFeaturePair,
    t: number,
    width: number,
    height: number,
  ): MaskBind | null {
    const view = this.gpuRenderer.renderFeathered({
      project,
      region,
      t,
      width,
      height,
      feather: region.feather,
      contentRect: this.contentRect,
    });
    return view ? { ...this.noMask(), view, hasMask: true } : null;
  }

  advectPaintedMask(
    mask: MaskBind,
    backend: MorphBackend,
    frame: MorphFrame,
    layerT: number,
    layerProject: MorphProject,
  ): void {
    if (!mask.hasPaint || !backend.renderWarpMap) return;
    this.warpMapTarget = syncRenderTexture(
      this.device,
      this.warpMapTarget,
      frame.canvasWidth,
      frame.canvasHeight,
      WARP_MAP_FORMAT,
    );
    backend.renderWarpMap({
      ...frame,
      target: this.warpMapTarget.view,
      t: layerT,
      project: layerProject,
    });
    mask.warpView = this.warpMapTarget.view;
    mask.hasWarp = true;
  }

  dispose(): void {
    this.warpMapTarget?.texture.destroy();
    for (const entry of this.paintedMasks.values()) {
      entry.texture?.texture.destroy();
    }
    this.paintedMasks.clear();
    this.fallback.texture.destroy();
    this.gpuRenderer.dispose();
    this.warpMapTarget = null;
  }

  private paintedMaskFor(layer: MorphLayer): GPUTextureView | null {
    const source = layer.paintedMask;
    if (!source) return null;
    const cached = this.paintedMasks.get(layer.id);
    if (cached && cached.source === source) {
      return cached.texture?.view ?? null;
    }
    cached?.texture?.texture.destroy();

    let texture: RenderTexture | null;
    try {
      const bytes = decodeMaskBytes(source.data, source.width * source.height);
      const gpuTexture = this.device.createTexture({
        size: [source.width, source.height],
        format: "r8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.writeTexture(
        { texture: gpuTexture },
        bytes,
        { bytesPerRow: source.width, rowsPerImage: source.height },
        [source.width, source.height],
      );
      texture = {
        texture: gpuTexture,
        view: gpuTexture.createView(),
        width: source.width,
        height: source.height,
      };
    } catch {
      texture = null;
    }
    this.paintedMasks.set(layer.id, { source, texture });
    return texture?.view ?? null;
  }

  private prunePaintedMasks(project: MorphProject): void {
    for (const [layerId, entry] of this.paintedMasks) {
      const layer = project.layers.find(
        (candidate) => candidate.id === layerId,
      );
      if (!layer || layer.paintedMask !== entry.source) {
        entry.texture?.texture.destroy();
        this.paintedMasks.delete(layerId);
      }
    }
  }
}

function createMaskTexture(
  device: GPUDevice,
  width: number,
  height: number,
): RenderTexture {
  const texture = device.createTexture({
    size: [width, height],
    format: "r8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  return { texture, view: texture.createView(), width, height };
}
