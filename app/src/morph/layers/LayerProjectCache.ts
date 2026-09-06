import {
  defaultGlobalLayer,
  effectiveLayerAlgorithm,
  enabledFeaturesForLayer,
  projectForLayer,
  type LayerId,
  type MorphAlgorithmId,
  type MorphLayer,
  type MorphProject,
} from "@/morph/model";

type CacheEntry = {
  project: MorphProject;
  layer: MorphLayer;
  forcedAlgorithm?: MorphAlgorithmId;
  renderProject: MorphProject;
};

/** Preserves per-layer project identity so algorithm backends keep their caches. */
export class LayerProjectCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(
    project: MorphProject,
    layer: MorphLayer,
    forcedAlgorithm?: MorphAlgorithmId,
  ): MorphProject {
    const key = `${layer.id}|${forcedAlgorithm ?? ""}`;
    const cached = this.entries.get(key);
    if (
      cached &&
      cached.project === project &&
      cached.layer === layer &&
      cached.forcedAlgorithm === forcedAlgorithm
    ) {
      return cached.renderProject;
    }

    const layerProject = projectForLayer(project, layer);
    const renderProject = {
      ...layerProject,
      activeAlgorithm:
        forcedAlgorithm ?? effectiveLayerAlgorithm(project, layer),
      features: enabledFeaturesForLayer(project, layer),
    };
    this.entries.set(key, {
      project,
      layer,
      forcedAlgorithm,
      renderProject,
    });
    return renderProject;
  }

  /** Prunes stale project views and returns the backend pool's active keys. */
  prune(
    project: MorphProject,
    forcedAlgorithm?: MorphAlgorithmId,
  ): Map<LayerId, MorphAlgorithmId> {
    const layers =
      project.layers.length > 0 ? project.layers : [defaultGlobalLayer()];
    const active = new Map<LayerId, MorphAlgorithmId>();
    for (const layer of layers) {
      active.set(
        layer.id,
        forcedAlgorithm ?? effectiveLayerAlgorithm(project, layer),
      );
    }

    const layerIds = new Set(layers.map((layer) => layer.id));
    for (const [key, cached] of this.entries) {
      if (
        !layerIds.has(cached.layer.id) ||
        cached.forcedAlgorithm !== forcedAlgorithm
      ) {
        this.entries.delete(key);
      }
    }
    return active;
  }

  clear(): void {
    this.entries.clear();
  }
}
