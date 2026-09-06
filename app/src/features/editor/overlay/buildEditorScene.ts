import {
  featureHandles,
  visibleFeatures,
  type BeierNeelySettings,
  type FeaturePair,
  type FeatureSide,
  type MeshSettings,
  type MorphProject,
  type TpsSettings,
  type Vec2,
} from "@/morph/model";
import { collectTpsLandmarks } from "@/morph/algorithms/tps/collectLandmarks";
import { evalTps, solveTps } from "@/morph/algorithms/tps/solveTps";
import { buildMorphLines } from "@/morph/algorithms/beier/buildMorphLines";
import { warpToA, warpToB } from "@/morph/algorithms/beier/beierWarp";
import {
  renderedContour,
  renderedRegionRing,
} from "@/lib/geometry/regionContour";
import { isSimpleRing } from "@/lib/geometry/isSimpleRing";
import type { OverlayLayerScope } from "@/morph/layers/debug";
import {
  emptyScene,
  type OverlayScene,
  type Rgba,
} from "@/morph/overlay/scene";
import type { OverlayPalette } from "./resolveOverlayColors";
import {
  beierInfluenceGrid,
  cachedPaneMesh,
  interpolatedPoints,
  meshSegments,
  overlayProjectsFor,
  tpsGridLines,
} from "./previewOverlayData";
import { OverlayGeometryCache, quantizeOverlayT } from "./overlayGeometryCache";

const GRID_DIVISIONS = 10;
const GRID_STEPS = 40;

/** Override a colour's alpha (base colours are stored at full alpha). */
function withAlpha(c: Rgba, a: number): Rgba {
  return [c[0], c[1], c[2], c[3] * a];
}

/** Pushes a polyline (open) as a run of line segments. */
function addPolyline(
  scene: OverlayScene,
  points: Vec2[],
  color: Rgba,
  widthPx: number,
): void {
  for (let i = 0; i + 1 < points.length; i++) {
    scene.lines.push({ a: points[i], b: points[i + 1], color, widthPx });
  }
}

/**
 * Merges warp-grid lines into the scene over a halo: every halo first, then
 * every line, so crossings never show a halo painted over a neighbouring line.
 * The halo keeps grids legible whatever the media background.
 */
function addGridLines(
  scene: OverlayScene,
  grid: OverlayScene,
  outline: Rgba,
): void {
  const halo = withAlpha(outline, 0.45);
  for (const l of grid.lines) {
    scene.lines.push({ ...l, color: halo, widthPx: l.widthPx + 1 });
  }
  scene.lines.push(...grid.lines);
}

/** Strokes a polyline/region outline (Catmull-Rom when `smooth`, optionally closed). */
function strokeContour(
  scene: OverlayScene,
  points: Vec2[],
  smooth: boolean | undefined,
  closed: boolean,
  color: Rgba,
  widthPx: number,
): void {
  addPolyline(scene, renderedContour(points, smooth, closed), color, widthPx);
}

// ----------------------------------------------------------------- panes -----

/** Grids to draw on a side pane (each non-null ⇒ shown). Mirrors FeaturePane gating. */
export type PaneGrids = {
  mesh: MeshSettings | null;
  tps: { settings: TpsSettings; tq: number } | null;
  beier: { settings: BeierNeelySettings; t: number } | null;
};

export type PaneSceneParams = {
  side: FeatureSide;
  features: FeaturePair[];
  showFeatures: boolean;
  selection: string[];
  /** Eased hover emphasis per feature (0..1); selection is handled separately. */
  emphasisFor: (id: string) => number;
  /** Hovered handle, mirrored to BOTH panes so A↔B correspondence reads. */
  hover?: { featureId: string; handleKey: string | null } | null;
  /** Looping beacon phase (0..1) while something is hovered. */
  pulse?: number;
  /** One-shot expanding rings on specific handles (e.g. polygon close). */
  burst?: {
    featureId: string;
    handleKeys: string[];
    progress: number;
  } | null;
  grids: PaneGrids;
  palette: OverlayPalette;
};

/** Expanding, fading beacon ring around a handle (hover ping / close burst). */
function addBeaconRing(
  scene: OverlayScene,
  pos: Vec2,
  baseRadiusPx: number,
  phase: number,
  color: Rgba,
): void {
  const eased = 1 - (1 - phase) * (1 - phase);
  scene.dots.push({
    pos,
    radiusPx: baseRadiusPx + 3 + eased * 11,
    fill: withAlpha(color, 0),
    stroke: withAlpha(color, (1 - phase) * 0.9),
    strokeWidthPx: 1.5,
  });
}

function addPaneMesh(
  scene: OverlayScene,
  features: FeaturePair[],
  settings: MeshSettings,
  side: FeatureSide,
  color: Rgba,
): void {
  const mesh = cachedPaneMesh(features, settings);
  const points = side === "a" ? mesh.pointsA : mesh.pointsB;
  const seen = new Set<string>();
  const at = (i: number): Vec2 => ({ x: points[i * 2], y: points[i * 2 + 1] });
  const edge = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    scene.lines.push({ a: at(a), b: at(b), color, widthPx: 0.75 });
  };
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const a = mesh.triangles[i];
    const b = mesh.triangles[i + 1];
    const c = mesh.triangles[i + 2];
    edge(a, b);
    edge(b, c);
    edge(c, a);
  }
}

// Pane grid memos (M22 lot 4): the TPS solve (O(n³)) and Beier warps are
// cached per (features identity, settings, quantized t, side); redraws and
// scrub frames at an unchanged quantized time reuse the same polylines.
const paneTpsCache = new OverlayGeometryCache<Vec2[][]>();
const paneBeierCache = new OverlayGeometryCache<Vec2[][]>();

function paneTpsGridLines(
  features: FeaturePair[],
  settings: TpsSettings,
  tq: number,
  side: FeatureSide,
): Vec2[][] {
  return paneTpsCache.get(features, settings, `${tq}|${side}`, () => {
    const lm = collectTpsLandmarks(features, settings);
    if (lm.count < 3) return [];
    const n = lm.count;
    const dst = side === "a" ? lm.a : lm.b;
    const mid = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) mid[i] = lm.a[i] * (1 - tq) + lm.b[i] * tq;

    let coeff: ReturnType<typeof solveTps>;
    try {
      coeff = solveTps(mid, dst.subarray(0, n * 2), settings.lambda);
    } catch {
      return [];
    }
    const warp = (u: number, v: number) => evalTps(coeff, u, v);
    const lines: Vec2[][] = [];

    for (let i = 0; i <= GRID_DIVISIONS; i++) {
      const c = i / GRID_DIVISIONS;
      const horizontal: Vec2[] = [];
      const vertical: Vec2[] = [];
      for (let k = 0; k <= GRID_STEPS; k++) {
        const f = k / GRID_STEPS;
        horizontal.push(warp(f, c));
        vertical.push(warp(c, f));
      }
      lines.push(horizontal, vertical);
    }
    return lines;
  });
}

function addPaneTps(
  scene: OverlayScene,
  features: FeaturePair[],
  settings: TpsSettings,
  tq: number,
  side: FeatureSide,
  color: Rgba,
): void {
  for (const line of paneTpsGridLines(features, settings, tq, side)) {
    addPolyline(scene, line, color, 0.75);
  }
}

function paneBeierGridLines(
  features: FeaturePair[],
  settings: BeierNeelySettings,
  t: number,
  side: FeatureSide,
): Vec2[][] {
  const qt = quantizeOverlayT(t);
  return paneBeierCache.get(features, settings, `${qt}|${side}`, () => {
    const lines = buildMorphLines(features, settings);
    if (lines.length === 0) return [];
    const coeffs = { a: settings.a, b: settings.b, p: settings.p };
    const warp = (p: Vec2) =>
      side === "a"
        ? warpToA(p, lines, qt, coeffs)
        : warpToB(p, lines, qt, coeffs);
    const grid: Vec2[][] = [];

    for (let i = 0; i <= GRID_DIVISIONS; i++) {
      const c = i / GRID_DIVISIONS;
      const horizontal: Vec2[] = [];
      const vertical: Vec2[] = [];
      for (let k = 0; k <= GRID_STEPS; k++) {
        const f = k / GRID_STEPS;
        horizontal.push(warp({ x: f, y: c }));
        vertical.push(warp({ x: c, y: f }));
      }
      grid.push(horizontal, vertical);
    }
    return grid;
  });
}

function addPaneBeier(
  scene: OverlayScene,
  features: FeaturePair[],
  settings: BeierNeelySettings,
  t: number,
  side: FeatureSide,
  color: Rgba,
): void {
  for (const line of paneBeierGridLines(features, settings, t, side)) {
    addPolyline(scene, line, color, 0.75);
  }
}

function addPaneFeatures(scene: OverlayScene, p: PaneSceneParams): void {
  const accent = p.side === "a" ? p.palette.accentA : p.palette.accentB;
  for (const f of p.features) {
    if (!f.enabled) continue;
    const pts = featureHandles(f, p.side).map((h) => h.pos);
    if (pts.length === 0) continue;
    const selected = p.selection.includes(f.id);
    // Emphasis eases 0→1 on hover (~120 ms); selection snaps to full instantly.
    const e = selected ? 1 : p.emphasisFor(f.id);
    const r = 5 + 2 * e;
    const widthPx = 1.5 + e;

    if (f.kind === "segment" && pts.length === 2) {
      scene.lines.push({ a: pts[0], b: pts[1], color: accent, widthPx });
    } else if (f.kind === "polyline" && pts.length >= 2) {
      strokeContour(scene, pts, f.smooth, f.closed === true, accent, widthPx);
    } else if (f.kind === "region" && pts.length >= 3) {
      // A self-crossing ring has no well-defined fill (ear clipping would
      // spray stray triangles), so only the outline is drawn until it's fixed.
      if (isSimpleRing(pts)) {
        scene.fills.push({
          points: renderedRegionRing(pts, f.smooth),
          color: withAlpha(accent, 0.1 + e * 0.08),
        });
      }
      strokeContour(scene, pts, f.smooth, true, accent, widthPx);
    }

    const stroke = selected
      ? p.palette.selectedStroke
      : p.palette.unselectedStroke;
    const strokeWidthPx = selected ? 2 : 1;
    const handles = featureHandles(f, p.side);
    const hoveredKey =
      p.hover && p.hover.featureId === f.id ? p.hover.handleKey : null;
    for (const h of handles) {
      const hovered = hoveredKey !== null && h.key === hoveredKey;
      scene.dots.push({
        pos: h.pos,
        radiusPx: hovered ? r + 1 : r,
        fill: accent,
        stroke: hovered ? p.palette.selectedStroke : stroke,
        strokeWidthPx: hovered ? 2 : strokeWidthPx,
      });
      // Hover beacon: the same handle pings in both panes (A↔B correspondence).
      if (hovered) {
        addBeaconRing(scene, h.pos, r, p.pulse ?? 0, p.palette.selectedStroke);
      }
    }
    if (p.burst && p.burst.featureId === f.id) {
      for (const key of p.burst.handleKeys) {
        const h = handles.find((x) => x.key === key);
        if (h) {
          addBeaconRing(
            scene,
            h.pos,
            r + 4,
            p.burst.progress,
            p.palette.selectedStroke,
          );
        }
      }
    }
  }
}

/** Builds the overlay scene for one side pane (source/target), at parity with the
 * old FeatureOverlay + MeshWireframe + TpsGrid + BeierInfluenceGrid (PRD M11). */
export function buildPaneScene(p: PaneSceneParams): OverlayScene {
  const scene = emptyScene();
  const grids = emptyScene();
  const grid = withAlpha(p.palette.foreground, 0.35);
  if (p.grids.mesh) addPaneMesh(grids, p.features, p.grids.mesh, p.side, grid);
  if (p.grids.tps) {
    addPaneTps(
      grids,
      p.features,
      p.grids.tps.settings,
      p.grids.tps.tq,
      p.side,
      grid,
    );
  }
  if (p.grids.beier) {
    addPaneBeier(
      grids,
      p.features,
      p.grids.beier.settings,
      p.grids.beier.t,
      p.side,
      withAlpha(p.palette.beierGrid, 0.55),
    );
  }
  addGridLines(scene, grids, p.palette.gridOutline);
  if (p.showFeatures) addPaneFeatures(scene, p);
  return scene;
}

// --------------------------------------------------------------- preview -----

export type PreviewOverlayToggles = {
  features: boolean;
  mesh: boolean;
  tpsGrid: boolean;
  beierField: boolean;
};

export type PreviewSceneParams = {
  /** Project sampled at the current per-side video times (timedProject). */
  project: MorphProject;
  t: number;
  tauSec: number;
  activeLayerId: string;
  overlayScope: OverlayLayerScope;
  overlays: PreviewOverlayToggles;
  palette: OverlayPalette;
};

function previewFeatureColor(
  kind: FeaturePair["kind"],
  pv: OverlayPalette["preview"],
): Rgba {
  switch (kind) {
    case "point":
      return pv.point;
    case "segment":
      return pv.segment;
    case "polyline":
      return pv.polyline;
    case "region":
      return pv.region;
  }
}

/** Builds the overlay scene for the centre morph preview, at parity with the old
 * PreviewMorphOverlay feature + mesh/TPS/Beier drawing (PRD M11). Coverage
 * highlight + missing-frame badges stay in the component. */
export function buildPreviewScene(p: PreviewSceneParams): OverlayScene {
  const scene = emptyScene();
  const pv = p.palette.preview;
  const op = overlayProjectsFor(
    p.project,
    p.activeLayerId,
    p.overlayScope,
    p.tauSec,
  );

  const showMesh =
    p.overlays.mesh && op.some((item) => item.activeAlgorithm === "mesh");
  const showTps =
    p.overlays.tpsGrid &&
    op.some((item) => item.activeAlgorithm === "thin-plate-spline");
  const showBeier =
    p.overlays.beierField &&
    op.some((item) => item.activeAlgorithm === "beier-neely");

  const grids = emptyScene();
  if (showMesh) {
    const meshColor = withAlpha(pv.mesh, 0.58);
    for (const item of op) {
      if (item.activeAlgorithm !== "mesh") continue;
      for (const [a, b] of meshSegments(item, p.t)) {
        grids.lines.push({ a, b, color: meshColor, widthPx: 1.15 });
      }
    }
  }

  if (showTps) {
    const tpsColor = withAlpha(pv.tpsGrid, 0.66);
    for (const item of op) {
      if (item.activeAlgorithm !== "thin-plate-spline") continue;
      for (const line of tpsGridLines(item, p.t)) {
        addPolyline(grids, line, tpsColor, 0.95);
      }
    }
  }
  addGridLines(scene, grids, p.palette.gridOutline);

  if (p.overlays.features) {
    for (const item of op) {
      for (const feature of visibleFeatures(item)) {
        const pts = interpolatedPoints(feature, p.t);
        if (pts.length === 0) continue;
        const color = previewFeatureColor(feature.kind, pv);
        const smooth = "smooth" in feature ? feature.smooth : undefined;
        if (feature.kind === "segment" && pts.length === 2) {
          scene.lines.push({ a: pts[0], b: pts[1], color, widthPx: 2 });
        } else if (feature.kind === "polyline" && pts.length >= 2) {
          strokeContour(scene, pts, smooth, feature.closed === true, color, 2);
        } else if (feature.kind === "region" && pts.length >= 3) {
          if (isSimpleRing(pts)) {
            scene.fills.push({
              points: renderedRegionRing(pts, smooth),
              color: withAlpha(color, 0.12),
            });
          }
          strokeContour(scene, pts, smooth, true, color, 2);
        }
        const radiusPx = feature.kind === "point" ? 5 : 4;
        for (const pos of pts) {
          scene.dots.push({
            pos,
            radiusPx,
            fill: color,
            stroke: pv.halo,
            strokeWidthPx: 1,
          });
        }
      }
    }
  }

  if (showBeier) {
    const beier = emptyScene();
    const beierColor = withAlpha(pv.beierField, 0.72);
    for (const item of op) {
      if (item.activeAlgorithm !== "beier-neely") continue;
      for (const line of beierInfluenceGrid(item, p.t)) {
        addPolyline(beier, line, beierColor, 1.05);
      }
    }
    addGridLines(scene, beier, p.palette.gridOutline);
  }

  return scene;
}
