import {
  buildMorphLines,
  type MorphLine,
} from "@/morph/algorithms/beier/buildMorphLines";
import {
  lineDistance,
  mapPointByLinePair,
  type BeierCoeffs,
} from "@/morph/algorithms/beier/beierWarp";
import { collectTpsLandmarks } from "@/morph/algorithms/tps/collectLandmarks";
import { evalTps, solveTps } from "@/morph/algorithms/tps/solveTps";
import { buildMesh, type MeshCache } from "@/morph/mesh/buildMesh";
import {
  effectiveLayerAlgorithm,
  enabledFeaturesForLayer,
  layerContributesToRender,
  projectForLayer,
  sortLayers,
  visibleFeatures,
  type FeaturePair,
  type MeshSettings,
  type MorphLayer,
  type MorphProject,
  type Vec2,
} from "@/morph/model";
import type { OverlayLayerScope } from "@/morph/layers/debug";
import { OverlayGeometryCache, quantizeOverlayT } from "./overlayGeometryCache";

const TPS_GRID_DIVISIONS = 10;
const TPS_GRID_STEPS = 40;
const TPS_T_STEPS = 256;
const BEIER_GRID_DIVISIONS = 10;
const BEIER_GRID_STEPS = 40;

/**
 * Pure data for the morph-preview overlay (PRD M11). Extracted verbatim from the
 * old `PreviewMorphOverlay` so the GPU scene builder and the (trimmed) component
 * share one source of truth: interpolated feature points, deduped mesh segments,
 * and TPS / Beier warp grids — all in project space (0..1), aggregated across the
 * layers in scope.
 */

function mix(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function interpolatedPoints(feature: FeaturePair, t: number): Vec2[] {
  switch (feature.kind) {
    case "point":
      return [mix(feature.a, feature.b, t)];
    case "segment":
      return [mix(feature.a0, feature.b0, t), mix(feature.a1, feature.b1, t)];
    case "polyline":
    case "region": {
      const count = Math.min(feature.a.length, feature.b.length);
      return Array.from({ length: count }, (_, i) =>
        mix(feature.a[i], feature.b[i], t),
      );
    }
  }
}

// Geometry memos (M22 lot 4): the per-frame Delaunay/TPS-solve/Beier-warp work
// is cached by identity (features array or overlay project) + settings +
// quantized t, so scrub frames and multi-pane redraws reuse the same geometry.
const meshCache = new OverlayGeometryCache<MeshCache>();
const meshSegmentsCache = new OverlayGeometryCache<[Vec2, Vec2][]>();
const tpsGridCache = new OverlayGeometryCache<Vec2[][]>();
const beierGridCache = new OverlayGeometryCache<Vec2[][]>();

/** Memoized {@link buildMesh} keyed on the features array identity. */
export function cachedPaneMesh(
  features: FeaturePair[],
  settings: MeshSettings,
): MeshCache {
  return meshCache.get(features, settings, "mesh", () =>
    buildMesh(features, settings),
  );
}

/** Unique triangulation edges as point pairs at progress `t`. */
export function meshSegments(project: MorphProject, t: number): [Vec2, Vec2][] {
  const settings = project.algorithmSettings.mesh;
  const qt = quantizeOverlayT(t);
  return meshSegmentsCache.get(project, settings, `${qt}`, () => {
    const mesh = meshCache.get(project, settings, "mesh", () =>
      buildMesh(visibleFeatures(project), settings),
    );
    const points: Vec2[] = [];
    for (let i = 0; i < mesh.pointsA.length / 2; i++) {
      points.push(
        mix(
          { x: mesh.pointsA[i * 2], y: mesh.pointsA[i * 2 + 1] },
          { x: mesh.pointsB[i * 2], y: mesh.pointsB[i * 2 + 1] },
          qt,
        ),
      );
    }

    const seen = new Set<string>();
    const segments: [Vec2, Vec2][] = [];
    const add = (a: number, b: number) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      if (seen.has(key)) return;
      seen.add(key);
      segments.push([points[lo], points[hi]]);
    };

    for (let i = 0; i < mesh.triangles.length; i += 3) {
      const a = mesh.triangles[i];
      const b = mesh.triangles[i + 1];
      const c = mesh.triangles[i + 2];
      add(a, b);
      add(b, c);
      add(c, a);
    }
    return segments;
  });
}

export function tpsGridLines(project: MorphProject, t: number): Vec2[][] {
  const settings = project.algorithmSettings.thinPlateSpline;
  const tq = Math.round(t * TPS_T_STEPS) / TPS_T_STEPS;
  return tpsGridCache.get(project, settings, `${tq}`, () => {
    const features = visibleFeatures(project);
    const lm = collectTpsLandmarks(features, settings);
    if (lm.count < 3) return [];

    const n = lm.count;
    const mid = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) {
      mid[i] = lm.a[i] * (1 - tq) + lm.b[i] * tq;
    }

    let coeff;
    try {
      coeff = solveTps(lm.a.subarray(0, n * 2), mid, settings.lambda);
    } catch {
      return [];
    }

    const warp = (u: number, v: number) => evalTps(coeff, u, v);
    const lines: Vec2[][] = [];

    for (let i = 0; i <= TPS_GRID_DIVISIONS; i++) {
      const c = i / TPS_GRID_DIVISIONS;
      const horizontal: Vec2[] = [];
      const vertical: Vec2[] = [];
      for (let k = 0; k <= TPS_GRID_STEPS; k++) {
        const f = k / TPS_GRID_STEPS;
        horizontal.push(warp(f, c));
        vertical.push(warp(c, f));
      }
      lines.push(horizontal, vertical);
    }

    return lines;
  });
}

function beierWeight(
  line: MorphLine,
  source0: Vec2,
  source1: Vec2,
  p: Vec2,
  coeffs: BeierCoeffs,
): number {
  const length = distance(source0, source1);
  const d = lineDistance(p, source0, source1);
  return (
    Math.pow(Math.pow(length, coeffs.p) / (coeffs.a + d), coeffs.b) *
    line.weight
  );
}

function warpBeierSourceAToMid(
  p: Vec2,
  lines: MorphLine[],
  t: number,
  coeffs: BeierCoeffs,
): Vec2 {
  let totalX = 0;
  let totalY = 0;
  let totalWeight = 0;

  for (const line of lines) {
    const mid0 = mix(line.a0, line.b0, t);
    const mid1 = mix(line.a1, line.b1, t);
    const mapped = mapPointByLinePair(p, line.a0, line.a1, mid0, mid1);
    const weight = beierWeight(line, line.a0, line.a1, p, coeffs);

    totalX += (mapped.x - p.x) * weight;
    totalY += (mapped.y - p.y) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0.000001) return { ...p };
  return { x: p.x + totalX / totalWeight, y: p.y + totalY / totalWeight };
}

export function beierInfluenceGrid(project: MorphProject, t: number): Vec2[][] {
  const settings = project.algorithmSettings.beierNeely;
  const qt = quantizeOverlayT(t);
  return beierGridCache.get(project, settings, `${qt}`, () => {
    const lines = buildMorphLines(visibleFeatures(project), settings);
    if (lines.length === 0) return [];

    const coeffs = { a: settings.a, b: settings.b, p: settings.p };
    const grid: Vec2[][] = [];

    for (let i = 0; i <= BEIER_GRID_DIVISIONS; i++) {
      const c = i / BEIER_GRID_DIVISIONS;
      const horizontal: Vec2[] = [];
      const vertical: Vec2[] = [];

      for (let k = 0; k <= BEIER_GRID_STEPS; k++) {
        const f = k / BEIER_GRID_STEPS;
        horizontal.push(
          warpBeierSourceAToMid({ x: f, y: c }, lines, qt, coeffs),
        );
        vertical.push(warpBeierSourceAToMid({ x: c, y: f }, lines, qt, coeffs));
      }

      grid.push(horizontal, vertical);
    }

    return grid;
  });
}

// Per-layer overlay projects keep a stable identity while the underlying
// project and layer are unchanged, so the geometry memos above key off them.
const overlayProjectsByProject = new WeakMap<
  MorphProject,
  Map<string, { layer: MorphLayer; overlayProject: MorphProject }>
>();

function layerOverlayProject(
  project: MorphProject,
  layer: MorphLayer,
): MorphProject {
  let byLayer = overlayProjectsByProject.get(project);
  if (!byLayer) {
    byLayer = new Map();
    overlayProjectsByProject.set(project, byLayer);
  }
  const cached = byLayer.get(layer.id);
  if (cached && cached.layer === layer) return cached.overlayProject;

  const layerProject = projectForLayer(project, layer);
  const overlayProject = {
    ...layerProject,
    activeAlgorithm: effectiveLayerAlgorithm(project, layer),
    features: enabledFeaturesForLayer(project, layer),
  };
  byLayer.set(layer.id, { layer, overlayProject });
  return overlayProject;
}

/** The per-layer projects whose overlays should show, per the current scope. */
export function overlayProjectsFor(
  project: MorphProject,
  activeLayerId: string,
  scope: OverlayLayerScope,
  tauSec: number,
): MorphProject[] {
  if (scope === "all") {
    return sortLayers(project.layers)
      .filter((layer) => layerContributesToRender(project, layer, tauSec))
      .map((layer) => layerOverlayProject(project, layer));
  }
  const layer = project.layers.find((item) => item.id === activeLayerId);
  if (!layer || !layerContributesToRender(project, layer, tauSec)) return [];
  return [layerOverlayProject(project, layer)];
}
