import type { MorphBackend, MorphFrame } from "@/morph/algorithms/MorphBackend";
import {
  layerContributesToRender,
  projectAtFeatureTimes,
  type FeatureId,
  type FeaturePair,
  type LayerId,
  type MorphAlgorithmId,
  type MorphLayer,
  type RenderBackground,
} from "@/morph/model";
import { LayerBackendPool } from "./LayerBackendPool";
import { LayerCompositor } from "./LayerCompositor";
import { LayerProjectCache } from "./LayerProjectCache";
import { MaskTextureCache, type LivePaintedMask } from "./MaskTextureCache";
import { PresentRenderer } from "./PresentRenderer";
import type { LayerDebugMode } from "./debug";
import {
  baseLayerRenderSpec,
  compositeModeCode,
  layerRenderProgress,
  renderableLayersAt,
} from "./layerRenderPlan";

export type LayeredRenderOptions = {
  /** Compare view can force every layer through the inspected algorithm. */
  algorithm?: MorphAlgorithmId;
  /** Final presentation background. Intermediates always remain transparent. */
  background?: RenderBackground;
  debugMode?: LayerDebugMode;
  debugLayerId?: LayerId;
  /** In layer-mask mode, a selected region feature can be inspected directly. */
  debugMaskFeatureId?: FeatureId;
  /** Live brush mask, visible before the stroke is committed to the model. */
  livePaintedMask?: LivePaintedMask;
};

type RegionFeaturePair = Extract<FeaturePair, { kind: "region" }>;

/**
 * Stable façade shared by viewport and export. It orchestrates per-layer
 * backends while delegating GPU ownership to focused renderer components.
 */
export class LayeredRenderer {
  private readonly presenter: PresentRenderer;
  private readonly backends: LayerBackendPool;
  private readonly compositor: LayerCompositor;
  private readonly masks: MaskTextureCache;
  private readonly projects = new LayerProjectCache();

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.presenter = new PresentRenderer(device, format);
    this.backends = new LayerBackendPool(device, format);
    this.masks = new MaskTextureCache(device);
    this.compositor = new LayerCompositor(
      device,
      format,
      this.masks.fallbackView(),
    );
  }

  renderFrame(frame: MorphFrame, options: LayeredRenderOptions = {}): void {
    const sourceTimeSec = frame.sourceTimeSec ?? frame.tauSec ?? frame.t;
    const targetTimeSec = frame.targetTimeSec ?? frame.tauSec ?? frame.t;
    const project = projectAtFeatureTimes(
      frame.project,
      sourceTimeSec,
      targetTimeSec,
    );
    const frameForRender = { ...frame, project };
    const { canvasWidth, canvasHeight, target } = frame;
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    const background = options.background ?? "black";
    const tauSec = frame.tauSec ?? frame.t * project.timeline.durationSec;
    this.backends.prune(this.projects.prune(project, options.algorithm));
    this.compositor.sync(canvasWidth, canvasHeight);
    this.masks.beginFrame(project, frame.contentRect, options.livePaintedMask);

    const debugLayer = options.debugLayerId
      ? project.layers.find((layer) => layer.id === options.debugLayerId)
      : undefined;
    const debugMaskFeature = options.debugMaskFeatureId
      ? project.features.find(
          (feature): feature is RegionFeaturePair =>
            feature.id === options.debugMaskFeatureId &&
            feature.kind === "region" &&
            feature.enabled,
        )
      : undefined;

    if (debugLayer && options.debugMode === "layer-result") {
      const [debugTarget] = this.compositor.accumulators();
      this.renderLayerResult(
        { ...frameForRender, target: debugTarget.view },
        debugLayer,
        tauSec,
        options.algorithm,
      );
      this.presenter.render(debugTarget.view, target, background);
      return;
    }
    if (debugMaskFeature && options.debugMode === "layer-mask") {
      const [debugTarget] = this.compositor.accumulators();
      this.renderRegionMask(
        { ...frameForRender, target: debugTarget.view },
        debugMaskFeature,
      );
      this.presenter.render(debugTarget.view, target, background);
      return;
    }
    if (debugLayer && options.debugMode === "layer-mask") {
      const [debugTarget] = this.compositor.accumulators();
      this.renderLayerMask(
        { ...frameForRender, target: debugTarget.view },
        debugLayer,
        tauSec,
        options.algorithm,
      );
      this.presenter.render(debugTarget.view, target, background);
      return;
    }

    const layers = renderableLayersAt(project, tauSec);
    const base = baseLayerRenderSpec(project, tauSec, options.algorithm);
    let [current, next] = this.compositor.accumulators();
    this.renderBaseFrame(frameForRender, current.view, base);

    for (const layer of layers) {
      if (layer.opacity <= 0) continue;
      const { warpT, dissolveT } = layerRenderProgress(project, layer, tauSec);
      const layerT = warpT;
      const layerProject = this.projects.get(project, layer, options.algorithm);
      const algorithm = options.algorithm ?? layerProject.activeAlgorithm;
      const backend = this.backendFor(layer.id, algorithm);
      backend.renderFrame({
        ...frame,
        target: this.compositor.layer().view,
        t: warpT,
        dissolveT,
        project: layerProject,
      });

      const mask = this.masks.maskFor(
        project,
        layer,
        layerT,
        canvasWidth,
        canvasHeight,
      );
      this.masks.advectPaintedMask(mask, backend, frame, layerT, layerProject);
      this.compositor.composite({
        base: current.view,
        layer: this.compositor.layer().view,
        mask,
        target: next.view,
        project,
        contentRect: frame.contentRect,
        opacity: layer.opacity,
        mode: compositeModeCode(layer.compositeMode),
        invertMask: layer.mask?.invert ?? false,
      });
      [current, next] = [next, current];
    }

    if (debugLayer && options.debugMode === "contribution") {
      const { warpT: layerT } = layerRenderProgress(
        project,
        debugLayer,
        tauSec,
      );
      const covered = this.masks.coverageMaskFor(
        project,
        debugLayer,
        layerT,
        canvasWidth,
        canvasHeight,
        tauSec,
      );
      if (covered) {
        this.compositor.overlayContribution({
          base: current.view,
          mask: covered,
          target: next.view,
          project,
          contentRect: frame.contentRect,
          invertMask: debugLayer.mask?.invert ?? false,
        });
        current = next;
      }
    }

    this.presenter.render(current.view, target, background);
  }

  clear(target: GPUTextureView, background: RenderBackground = "black"): void {
    this.presenter.clear(target, background);
  }

  dispose(): void {
    this.backends.dispose();
    this.compositor.dispose();
    this.masks.dispose();
    this.presenter.dispose();
    this.projects.clear();
  }

  private backendFor(
    layerId: LayerId,
    algorithm: MorphAlgorithmId,
  ): MorphBackend {
    return this.backends.get(layerId, algorithm);
  }

  private renderLayerResult(
    frame: MorphFrame,
    layer: MorphLayer,
    tauSec: number,
    forcedAlgorithm?: MorphAlgorithmId,
  ): void {
    if (!layerContributesToRender(frame.project, layer, tauSec)) {
      this.compositor.clear(frame.target);
      return;
    }
    const layerProject = this.projects.get(
      frame.project,
      layer,
      forcedAlgorithm,
    );
    const algorithm = forcedAlgorithm ?? layerProject.activeAlgorithm;
    const { warpT, dissolveT } = layerRenderProgress(
      frame.project,
      layer,
      tauSec,
    );
    this.backendFor(layer.id, algorithm).renderFrame({
      ...frame,
      t: warpT,
      dissolveT,
      project: layerProject,
    });
  }

  private renderBaseFrame(
    frame: MorphFrame,
    target: GPUTextureView,
    base: ReturnType<typeof baseLayerRenderSpec>,
  ): void {
    const layerProject = this.projects.get(
      frame.project,
      base.layer,
      base.forcedAlgorithm,
    );
    this.backendFor(base.layer.id, base.algorithm).renderFrame({
      ...frame,
      target,
      t: base.warpT,
      dissolveT: base.dissolveT,
      project: layerProject,
    });
  }

  private renderLayerMask(
    frame: MorphFrame,
    layer: MorphLayer,
    tauSec: number,
    forcedAlgorithm?: MorphAlgorithmId,
  ): void {
    const { warpT: layerT } = layerRenderProgress(frame.project, layer, tauSec);
    const mask = this.masks.coverageMaskFor(
      frame.project,
      layer,
      layerT,
      frame.canvasWidth,
      frame.canvasHeight,
      tauSec,
    );
    if (!mask) {
      this.compositor.clear(frame.target);
      return;
    }
    const layerProject = this.projects.get(
      frame.project,
      layer,
      forcedAlgorithm,
    );
    const algorithm = forcedAlgorithm ?? layerProject.activeAlgorithm;
    this.masks.advectPaintedMask(
      mask,
      this.backendFor(layer.id, algorithm),
      frame,
      layerT,
      layerProject,
    );
    this.compositor.drawMask({
      mask,
      target: frame.target,
      project: frame.project,
      contentRect: frame.contentRect,
      invertMask: layer.mask?.invert ?? false,
    });
  }

  private renderRegionMask(frame: MorphFrame, region: RegionFeaturePair): void {
    const mask = this.masks.regionMask(
      frame.project,
      region,
      frame.t,
      frame.canvasWidth,
      frame.canvasHeight,
    );
    if (!mask) {
      this.compositor.clear(frame.target);
      return;
    }
    this.compositor.drawMask({
      mask,
      target: frame.target,
      project: frame.project,
      contentRect: frame.contentRect,
      invertMask: false,
    });
  }
}
