import Delaunator from "delaunator";
import type { FeaturePair, MeshSettings, NormalizedVec2 } from "@/morph/model";
import { buildBorderAnchors } from "./buildBorderAnchors";

/** Triangulated mesh shared by the warp passes (PRD §10.3). */
export type MeshCache = {
  /** Vertex positions in image A, normalized Project Space (x, y interleaved). */
  pointsA: Float32Array;
  /** Vertex positions in image B. */
  pointsB: Float32Array;
  /** Midpoints mix(A, B, 0.5) — the shape that is triangulated. */
  pointsMid: Float32Array;
  /** Triangle vertex indices (every 3 form a triangle). */
  triangles: Uint32Array;
};

/**
 * Builds the morph mesh: collects enabled point features (their A/B positions),
 * appends border anchors, triangulates the midpoints with Delaunator. Anchors
 * share the same position on both sides, so they never warp.
 */
export function buildMesh(
  features: FeaturePair[],
  settings: MeshSettings,
): MeshCache {
  const aList: NormalizedVec2[] = [];
  const bList: NormalizedVec2[] = [];

  for (const f of features) {
    if (f.kind !== "point" || !f.enabled) continue;
    aList.push(f.a);
    bList.push(f.b);
  }

  if (settings.borderAnchors) {
    const anchors = buildBorderAnchors({
      corners: true,
      edgesPerSide: settings.borderAnchorCount,
    });
    for (const anchor of anchors) {
      aList.push(anchor);
      bList.push(anchor);
    }
  }

  const n = aList.length;
  const pointsA = new Float32Array(n * 2);
  const pointsB = new Float32Array(n * 2);
  const pointsMid = new Float32Array(n * 2);

  for (let i = 0; i < n; i++) {
    const a = aList[i];
    const b = bList[i];
    pointsA[i * 2] = a.x;
    pointsA[i * 2 + 1] = a.y;
    pointsB[i * 2] = b.x;
    pointsB[i * 2 + 1] = b.y;
    pointsMid[i * 2] = (a.x + b.x) * 0.5;
    pointsMid[i * 2 + 1] = (a.y + b.y) * 0.5;
  }

  const triangles =
    n >= 3 ? new Delaunator(pointsMid).triangles : new Uint32Array(0);

  return { pointsA, pointsB, pointsMid, triangles };
}
