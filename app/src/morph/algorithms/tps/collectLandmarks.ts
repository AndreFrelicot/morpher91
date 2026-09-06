import { buildBorderAnchors } from "@/morph/mesh/buildBorderAnchors";
import type { FeaturePair, NormalizedVec2, TpsSettings } from "@/morph/model";

/** Paired source/target landmarks feeding the TPS solve (x, y interleaved). */
export type TpsLandmarks = {
  a: Float32Array;
  b: Float32Array;
  count: number;
};

/** Safety cap on landmark count for v1 (PRD §18.3). */
export const MAX_TPS_LANDMARKS = 256;

/**
 * Collects the correspondence landmarks for the TPS warp (PRD §10.4):
 * enabled point features, optional polyline samples (paired by normalized
 * arc-length position so both sides stay in correspondence), and optional
 * border anchors (same position on both sides → no warp at the edges).
 * Truncated to {@link MAX_TPS_LANDMARKS}.
 */
export function collectTpsLandmarks(
  features: FeaturePair[],
  settings: TpsSettings,
): TpsLandmarks {
  const aList: NormalizedVec2[] = [];
  const bList: NormalizedVec2[] = [];

  for (const f of features) {
    if (!f.enabled) continue;
    if (f.kind === "point") {
      aList.push(f.a);
      bList.push(f.b);
    } else if (
      f.kind === "polyline" &&
      settings.samplePolylines &&
      f.a.length >= 2 &&
      f.b.length >= 2
    ) {
      sampleCorrespondingPolyline(
        f.a,
        f.b,
        settings.polylineSampleSpacing,
        aList,
        bList,
      );
    }
  }

  if (settings.borderAnchors) {
    for (const anchor of buildBorderAnchors({
      corners: true,
      edgesPerSide: settings.borderAnchorCount,
    })) {
      aList.push(anchor);
      bList.push(anchor);
    }
  }

  const count = Math.min(aList.length, MAX_TPS_LANDMARKS);
  const a = new Float32Array(count * 2);
  const b = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    a[i * 2] = aList[i].x;
    a[i * 2 + 1] = aList[i].y;
    b[i * 2] = bList[i].x;
    b[i * 2 + 1] = bList[i].y;
  }
  return { a, b, count };
}

/**
 * Samples both polyline sides at the same normalized arc-length positions, so
 * sample `k` on A corresponds to sample `k` on B. The number of samples is
 * driven by side A's length and `spacing` (closed polylines treated as open).
 */
function sampleCorrespondingPolyline(
  a: NormalizedVec2[],
  b: NormalizedVec2[],
  spacing: number,
  outA: NormalizedVec2[],
  outB: NormalizedVec2[],
): void {
  const lenA = polylineLength(a);
  const lenB = polylineLength(b);
  const samples = Math.max(2, Math.round(lenA / Math.max(spacing, 1e-4)) + 1);
  for (let k = 0; k < samples; k++) {
    const u = k / (samples - 1);
    outA.push(sampleByArcLength(a, lenA, u));
    outB.push(sampleByArcLength(b, lenB, u));
  }
}

function polylineLength(pts: NormalizedVec2[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/** Point at normalized arc-length position `u ∈ [0,1]` along the polyline;
 * `total` is the precomputed {@link polylineLength} of `pts`. */
function sampleByArcLength(
  pts: NormalizedVec2[],
  total: number,
  u: number,
): NormalizedVec2 {
  if (total === 0) return { ...pts[0] };
  const target = u * total;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= target || i === pts.length - 1) {
      const f = seg === 0 ? 0 : (target - acc) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      };
    }
    acc += seg;
  }
  return { ...pts[pts.length - 1] };
}
