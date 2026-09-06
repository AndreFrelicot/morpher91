import { describe, expect, it, vi } from "vitest";
import type { MorphBackend } from "@/morph/algorithms/MorphBackend";
import type { MorphAlgorithmId } from "@/morph/model";
import { LayerBackendPool } from "./LayerBackendPool";

function fakeBackend(algorithm: MorphAlgorithmId): MorphBackend {
  return {
    id: algorithm,
    renderFrame: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("LayerBackendPool", () => {
  it("keeps independent caches for layers using the same algorithm", () => {
    const created: MorphBackend[] = [];
    const pool = new LayerBackendPool(
      {} as GPUDevice,
      "rgba8unorm",
      (algorithm) => {
        const backend = fakeBackend(algorithm);
        created.push(backend);
        return backend;
      },
    );

    const face = pool.get("face", "thin-plate-spline");
    const hair = pool.get("hair", "thin-plate-spline");

    expect(face).not.toBe(hair);
    expect(pool.get("face", "thin-plate-spline")).toBe(face);
    expect(pool.get("hair", "thin-plate-spline")).toBe(hair);
    expect(created).toHaveLength(2);
  });

  it("keeps switched algorithms warm and disposes removed layers exactly once", () => {
    const pool = new LayerBackendPool(
      {} as GPUDevice,
      "rgba8unorm",
      (algorithm) => fakeBackend(algorithm),
    );
    const face = pool.get("face", "thin-plate-spline");
    const hair = pool.get("hair", "mesh");
    const nextFace = pool.get("face", "mesh");

    pool.prune(new Map([["face", "mesh"]]));

    expect(face.dispose).not.toHaveBeenCalled();
    expect(pool.get("face", "thin-plate-spline")).toBe(face);
    expect(pool.get("face", "mesh")).toBe(nextFace);
    expect(hair.dispose).toHaveBeenCalledTimes(1);

    pool.dispose();
    pool.dispose();
    expect(face.dispose).toHaveBeenCalledTimes(1);
    expect(nextFace.dispose).toHaveBeenCalledTimes(1);
  });
});
