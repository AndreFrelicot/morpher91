import { createBackend } from "@/morph/algorithms/backendFactory";
import type { MorphBackend } from "@/morph/algorithms/MorphBackend";
import type { LayerId, MorphAlgorithmId } from "@/morph/model";

export type BackendFactory = (
  algorithm: MorphAlgorithmId,
  device: GPUDevice,
  format: GPUTextureFormat,
) => MorphBackend;

type BackendEntry = {
  backend: MorphBackend;
};

/** Owns warm, bounded algorithm caches for each live layer. */
export class LayerBackendPool {
  private readonly entries = new Map<
    LayerId,
    Map<MorphAlgorithmId, BackendEntry>
  >();
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly factory: BackendFactory;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    factory: BackendFactory = createBackend,
  ) {
    this.device = device;
    this.format = format;
    this.factory = factory;
  }

  get(layerId: LayerId, algorithm: MorphAlgorithmId): MorphBackend {
    let layerEntries = this.entries.get(layerId);
    const current = layerEntries?.get(algorithm);
    if (current) return current.backend;
    const backend = this.factory(algorithm, this.device, this.format);
    if (!layerEntries) {
      layerEntries = new Map();
      this.entries.set(layerId, layerEntries);
    }
    layerEntries.set(algorithm, { backend });
    return backend;
  }

  /** Removes all warm algorithm instances owned by deleted layers. */
  prune(active: ReadonlyMap<LayerId, MorphAlgorithmId>): void {
    for (const [layerId, layerEntries] of this.entries) {
      if (active.has(layerId)) continue;
      for (const entry of layerEntries.values()) entry.backend.dispose();
      this.entries.delete(layerId);
    }
  }

  dispose(): void {
    for (const layerEntries of this.entries.values()) {
      for (const entry of layerEntries.values()) entry.backend.dispose();
    }
    this.entries.clear();
  }
}
