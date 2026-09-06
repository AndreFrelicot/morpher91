import {
  defaultGlobalLayer,
  effectiveLayerAlgorithm,
  GLOBAL_LAYER_ID,
  layerContributesToRender,
  layerTransitionAt,
  sortLayers,
  type LayerTransition,
  type MorphAlgorithmId,
  type MorphLayer,
  type MorphProject,
} from "@/morph/model";

const BLEND_MODE_CODE: Record<MorphLayer["compositeMode"], number> = {
  normal: 0,
  "source-over": 0,
  multiply: 2,
  screen: 3,
  lighter: 4,
};

export function renderableLayers(project: MorphProject): MorphLayer[] {
  const layers =
    project.layers.length > 0 ? project.layers : [defaultGlobalLayer()];
  return sortLayers(layers).filter((layer) =>
    layerContributesToRender(project, layer),
  );
}

export function renderableLayersAt(
  project: MorphProject,
  tauSec: number,
): MorphLayer[] {
  const layers =
    project.layers.length > 0 ? project.layers : [defaultGlobalLayer()];
  return sortLayers(layers).filter(
    (layer) =>
      layer.id !== GLOBAL_LAYER_ID &&
      layerContributesToRender(project, layer, tauSec),
  );
}

export function layerRenderProgress(
  project: MorphProject,
  layer: MorphLayer,
  tauSec: number,
): LayerTransition {
  return layerTransitionAt(project, layer, tauSec);
}

export function baseLayerRenderSpec(
  project: MorphProject,
  tauSec: number,
  forcedAlgorithm?: MorphAlgorithmId,
) {
  const layer =
    project.layers.find((candidate) => candidate.id === GLOBAL_LAYER_ID) ??
    defaultGlobalLayer();
  return {
    layer,
    algorithm: forcedAlgorithm ?? effectiveLayerAlgorithm(project, layer),
    forcedAlgorithm,
    ...layerRenderProgress(project, layer, tauSec),
  };
}

export function compositeModeCode(mode: MorphLayer["compositeMode"]): number {
  return BLEND_MODE_CODE[mode] ?? BLEND_MODE_CODE.normal;
}
