import { cubicBezierEase } from "@/lib/math/cubicBezier";
import type { FeatureId, LayerId, MorphAlgorithmId } from "./types";
import type { PaintedMask } from "./paintedMask";
import type { MorphProject } from "./project";

export const GLOBAL_LAYER_ID = "global";
/** User-creatable layers on top of the always-present Global layer (16 total). */
export const MAX_USER_LAYERS = 15;

export const NAMED_EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "smoothstep",
] as const;

export type NamedEasing = (typeof NAMED_EASINGS)[number];

/** Custom curve in CSS `cubic-bezier` terms; x and y stay in 0..1 (no overshoot). */
export type BezierEasing = {
  kind: "bezier";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Easing = NamedEasing | BezierEasing;

/** Per-layer transition control. PRD §9.2 */
export type LayerTiming = {
  warpStart: number;
  warpEnd: number;
  dissolveStart: number;
  dissolveEnd: number;
  easing: Easing;
  /** Distinct curve for the dissolve window; absent ⇒ same curve as `easing`. */
  dissolveEasing?: Easing;
};

export type LayerTimelineClip = {
  startSec: number;
  durationSec: number;
};

/** Warp and dissolve progress of one layer at a given master time. */
export type LayerTransition = {
  warpT: number;
  dissolveT: number;
};

/** Multi-layer morphing unit. PRD §9.1 */
export type MorphLayer = {
  id: LayerId;
  name: string;
  enabled: boolean;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  /** Feature IDs in this layer, or "all" for the global layer. */
  featureIds: FeatureId[] | "all";
  mask?: {
    featureId: FeatureId;
    mode: "hard" | "feathered";
    feather: number;
    invert?: boolean;
  };
  /** Brush-painted static mask, combined with the vector mask via max (M11 lot 3). */
  paintedMask?: PaintedMask;
  algorithmOverride?: MorphAlgorithmId;
  opacity: number;
  compositeMode: "source-over" | "normal" | "screen" | "multiply" | "lighter";
  timing: LayerTiming;
  clip?: LayerTimelineClip;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function easeTimeline(t: number, easing: Easing): number {
  if (typeof easing !== "string") {
    return cubicBezierEase(easing.x1, easing.y1, easing.x2, easing.y2)(t);
  }
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "smoothstep":
      return t * t * (3 - 2 * t);
    case "linear":
      return t;
  }
}

function remap(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

export function defaultGlobalLayer(): MorphLayer {
  return {
    id: GLOBAL_LAYER_ID,
    name: "Global",
    enabled: true,
    visible: true,
    locked: false,
    zIndex: 0,
    featureIds: "all",
    opacity: 1,
    compositeMode: "normal",
    timing: {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0,
      dissolveEnd: 1,
      easing: "smoothstep",
    },
    clip: defaultLayerClip(4),
  };
}

export function createLayer(name = "Layer", zIndex = 1): MorphLayer {
  return {
    ...defaultGlobalLayer(),
    id: crypto.randomUUID(),
    name,
    zIndex,
    featureIds: [],
  };
}

export function defaultLayerClip(durationSec: number): LayerTimelineClip {
  return {
    startSec: 0,
    durationSec: Math.max(0.001, durationSec),
  };
}

export function sortLayers(layers: MorphLayer[]): MorphLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex);
}

export function userLayerCount(layers: MorphLayer[]): number {
  return layers.filter((layer) => layer.id !== GLOBAL_LAYER_ID).length;
}

export function canAddUserLayer(layers: MorphLayer[]): boolean {
  return userLayerCount(layers) < MAX_USER_LAYERS;
}

export function featuresForLayer(
  project: MorphProject,
  layer: MorphLayer,
): MorphProject["features"] {
  if (layer.id === GLOBAL_LAYER_ID) {
    return project.features.filter((feature) => feature.layerId === undefined);
  }
  if (layer.featureIds === "all") return project.features;
  const allowed = new Set(layer.featureIds);
  return project.features.filter(
    (feature) => allowed.has(feature.id) || feature.layerId === layer.id,
  );
}

export function projectForLayer(
  project: MorphProject,
  layer: MorphLayer,
): MorphProject {
  return {
    ...project,
    activeAlgorithm: layer.algorithmOverride ?? project.activeAlgorithm,
    features: featuresForLayer(project, layer),
  };
}

export type LayerContributionStatus =
  | "base"
  | "disabled"
  | "hidden"
  | "outside-clip"
  | "no-contribution"
  | "masked"
  | "full-frame";

export type LayerContribution = {
  status: LayerContributionStatus;
  featureCount: number;
  enabledFeatureCount: number;
  hasMask: boolean;
  coversLowerLayers: boolean;
};

export function effectiveLayerAlgorithm(
  project: MorphProject,
  layer: MorphLayer,
): MorphAlgorithmId {
  return layer.algorithmOverride ?? project.activeAlgorithm;
}

export function enabledFeaturesForLayer(
  project: MorphProject,
  layer: MorphLayer,
): MorphProject["features"] {
  return featuresForLayer(project, layer).filter((feature) => feature.enabled);
}

export function layerHasEnabledMask(
  project: MorphProject,
  layer: MorphLayer,
): boolean {
  if (!layer.mask) return false;
  return project.features.some(
    (feature) =>
      feature.id === layer.mask?.featureId &&
      feature.kind === "region" &&
      feature.enabled &&
      feature.a.length >= 3 &&
      feature.b.length >= 3,
  );
}

export function layerContribution(
  project: MorphProject,
  layer: MorphLayer,
  tauSec?: number,
): LayerContribution {
  const featureCount = featuresForLayer(project, layer).length;
  const enabledFeatureCount = enabledFeaturesForLayer(project, layer).length;
  const hasMask =
    layerHasEnabledMask(project, layer) || layer.paintedMask !== undefined;

  if (!layer.enabled) {
    return {
      status: "disabled",
      featureCount,
      enabledFeatureCount,
      hasMask,
      coversLowerLayers: false,
    };
  }
  if (!layer.visible) {
    return {
      status: "hidden",
      featureCount,
      enabledFeatureCount,
      hasMask,
      coversLowerLayers: false,
    };
  }
  if (tauSec !== undefined && !layerActiveAt(project, layer, tauSec)) {
    return {
      status: "outside-clip",
      featureCount,
      enabledFeatureCount,
      hasMask,
      coversLowerLayers: false,
    };
  }
  if (layer.id === GLOBAL_LAYER_ID) {
    return {
      status: "base",
      featureCount,
      enabledFeatureCount,
      hasMask,
      coversLowerLayers: false,
    };
  }
  if (hasMask) {
    return {
      status: "masked",
      featureCount,
      enabledFeatureCount,
      hasMask,
      coversLowerLayers: false,
    };
  }
  if (enabledFeatureCount === 0) {
    return {
      status: "no-contribution",
      featureCount,
      enabledFeatureCount,
      hasMask,
      coversLowerLayers: false,
    };
  }
  return {
    status: "full-frame",
    featureCount,
    enabledFeatureCount,
    hasMask,
    coversLowerLayers: layer.opacity > 0,
  };
}

export function layerContributesToRender(
  project: MorphProject,
  layer: MorphLayer,
  tauSec?: number,
): boolean {
  const { status } = layerContribution(project, layer, tauSec);
  return (
    status !== "disabled" &&
    status !== "hidden" &&
    status !== "outside-clip" &&
    status !== "no-contribution"
  );
}

export function layerClipForProject(
  project: MorphProject,
  layer: MorphLayer,
): LayerTimelineClip {
  return layer.clip ?? defaultLayerClip(project.timeline.durationSec);
}

export function normalizeLayerClip(
  clip: LayerTimelineClip,
  timelineDurationSec: number,
): LayerTimelineClip {
  const total = Math.max(0.001, timelineDurationSec);
  const startSec = Math.min(total, Math.max(0, clip.startSec));
  const maxDuration = Math.max(0.001, total - startSec);
  return {
    ...clip,
    startSec,
    durationSec: Math.min(maxDuration, Math.max(0.001, clip.durationSec)),
  };
}

export function layerActiveAt(
  project: MorphProject,
  layer: MorphLayer,
  tauSec: number,
): boolean {
  const clip = layerClipForProject(project, layer);
  const start = Math.max(0, clip.startSec);
  const duration = Math.max(0, clip.durationSec);
  if (duration <= 0) return false;
  return tauSec >= start && tauSec <= start + duration;
}

/**
 * Warp and dissolve progress of a layer at `tauSec` (PRD §9.2). The clip gives
 * a raw 0..1 progress, then each window (warp, dissolve) remaps and eases it
 * separately, so a layer can warp over the whole clip while the crossfade only
 * happens in a shorter window.
 */
export function layerTransitionAt(
  project: MorphProject,
  layer: MorphLayer,
  tauSec: number,
): LayerTransition {
  const clip = layerClipForProject(project, layer);
  return transitionAtProgress(
    layer.timing,
    remap(tauSec, clip.startSec, clip.startSec + clip.durationSec),
  );
}

/** Warp and dissolve progress for a raw clip progress (0..1), before easing. */
export function transitionAtProgress(
  timing: LayerTiming,
  progress: number,
): LayerTransition {
  const {
    warpStart,
    warpEnd,
    dissolveStart,
    dissolveEnd,
    easing,
    dissolveEasing,
  } = timing;
  return {
    warpT: easeTimeline(remap(progress, warpStart, warpEnd), easing),
    dissolveT: easeTimeline(
      remap(progress, dissolveStart, dissolveEnd),
      dissolveEasing ?? easing,
    ),
  };
}

export function layerForFeature(
  project: MorphProject,
  layerId: LayerId | undefined,
): MorphLayer {
  return (
    project.layers.find((layer) => layer.id === (layerId ?? GLOBAL_LAYER_ID)) ??
    defaultGlobalLayer()
  );
}

export function isFeatureLayerVisible(
  project: MorphProject,
  layerId: LayerId | undefined,
): boolean {
  const layer = layerForFeature(project, layerId);
  return layer.enabled && layer.visible;
}

export function visibleFeatures(
  project: MorphProject,
): MorphProject["features"] {
  return project.features.filter(
    (feature) =>
      feature.enabled && isFeatureLayerVisible(project, feature.layerId),
  );
}
