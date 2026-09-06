import { describe, expect, it } from "vitest";
import {
  createPointFeature,
  createPolylineFeature,
  createRegionFeature,
  createSegmentFeature,
  defaultAlgorithmSettings,
} from "@/morph/model";
import { buildPaneScene, type PaneSceneParams } from "./buildEditorScene";
import type { OverlayPalette } from "./resolveOverlayColors";

const palette: OverlayPalette = {
  accentA: [1, 0, 0, 1],
  accentB: [0, 0, 1, 1],
  foreground: [1, 1, 1, 1],
  beierGrid: [1, 0.5, 0, 1],
  gridOutline: [1, 0, 0, 1],
  selectedStroke: [1, 1, 1, 1],
  unselectedStroke: [0, 0, 0, 0.6],
  preview: {
    point: [1, 1, 0, 1],
    segment: [1, 0, 0.5, 1],
    polyline: [0, 1, 1, 1],
    region: [0.6, 0.5, 1, 1],
    mesh: [0.2, 0.7, 1, 1],
    tpsGrid: [0.75, 0.5, 1, 1],
    beierField: [1, 0.6, 0.2, 1],
    halo: [0, 0, 0, 0.72],
  },
};

const noGrids = { mesh: null, tps: null, beier: null };

function paneParams(over: Partial<PaneSceneParams>): PaneSceneParams {
  return {
    side: "a",
    features: [],
    showFeatures: true,
    selection: [],
    emphasisFor: () => 0,
    grids: noGrids,
    palette,
    ...over,
  };
}

describe("buildPaneScene", () => {
  it("draws a point as a single dot at its side-a position", () => {
    const point = createPointFeature({ x: 0.25, y: 0.75 });
    const scene = buildPaneScene(paneParams({ features: [point] }));
    expect(scene.dots).toHaveLength(1);
    expect(scene.lines).toHaveLength(0);
    expect(scene.fills).toHaveLength(0);
    expect(scene.dots[0].pos).toEqual({ x: 0.25, y: 0.75 });
    expect(scene.dots[0].fill).toEqual(palette.accentA);
    expect(scene.dots[0].radiusPx).toBe(5);
  });

  it("uses side-b coordinates and accent on the target pane", () => {
    const seg = createSegmentFeature(
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.9, y: 0.9 },
    );
    const scene = buildPaneScene(paneParams({ side: "b", features: [seg] }));
    expect(scene.lines).toHaveLength(1);
    expect(scene.dots).toHaveLength(2);
    expect(scene.lines[0].a).toEqual({ x: 0.8, y: 0.8 });
    expect(scene.lines[0].b).toEqual({ x: 0.9, y: 0.9 });
    expect(scene.dots[0].fill).toEqual(palette.accentB);
  });

  it("draws a region as a fill plus a closed stroke plus vertex dots", () => {
    const region = createRegionFeature([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ]);
    const scene = buildPaneScene(paneParams({ features: [region] }));
    expect(scene.fills).toHaveLength(1);
    expect(scene.fills[0].points).toHaveLength(3);
    expect(scene.fills[0].color).toEqual([1, 0, 0, 0.1]); // accentA @ 0.1
    expect(scene.lines).toHaveLength(3); // closed ring
    expect(scene.dots).toHaveLength(3);
  });

  it("thickens selection: bigger dots, heavier strokes, brighter fill", () => {
    const region = createRegionFeature([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ]);
    const scene = buildPaneScene(
      paneParams({ features: [region], selection: [region.id] }),
    );
    expect(scene.fills[0].color).toEqual([1, 0, 0, 0.18]); // @ 0.18 when selected
    expect(scene.lines[0].widthPx).toBe(2.5);
    expect(scene.dots[0].radiusPx).toBe(7);
    expect(scene.dots[0].strokeWidthPx).toBe(2);
    expect(scene.dots[0].stroke).toEqual(palette.selectedStroke);
  });

  it("enlarges fully-emphasized (hovered, non-selected) dots without the ring", () => {
    const point = createPointFeature({ x: 0.5, y: 0.5 });
    const scene = buildPaneScene(
      paneParams({ features: [point], emphasisFor: () => 1 }),
    );
    expect(scene.dots[0].radiusPx).toBe(7);
    expect(scene.dots[0].strokeWidthPx).toBe(1);
    expect(scene.dots[0].stroke).toEqual(palette.unselectedStroke);
  });

  it("renders a smooth polyline as a Catmull-Rom curve, straight as segments", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0 },
    ];
    const straight = buildPaneScene(
      paneParams({ features: [createPolylineFeature(pts)] }),
    );
    const smooth = buildPaneScene(
      paneParams({
        features: [{ ...createPolylineFeature(pts), smooth: true }],
      }),
    );
    expect(straight.lines).toHaveLength(2); // raw segments between 3 points
    expect(smooth.lines.length).toBeGreaterThan(2); // subdivided curve
    // Control points still get their editable dots in both cases.
    expect(smooth.dots).toHaveLength(3);
  });

  it("uses the same smooth contour for a region fill and stroke", () => {
    const region = {
      ...createRegionFeature([
        { x: 0, y: 0 },
        { x: 0.5, y: 0.8 },
        { x: 1, y: 0 },
      ]),
      smooth: true,
    };
    const scene = buildPaneScene(paneParams({ features: [region] }));

    expect(scene.fills[0].points.length).toBeGreaterThan(region.a.length);
    expect(scene.lines).toHaveLength(scene.fills[0].points.length);
    expect(scene.lines[0].a).toEqual(scene.fills[0].points[0]);
    expect(scene.lines[0].b).toEqual(scene.fills[0].points[1]);
  });

  it("omits feature primitives when features are toggled off", () => {
    const point = createPointFeature({ x: 0.5, y: 0.5 });
    const scene = buildPaneScene(
      paneParams({ features: [point], showFeatures: false }),
    );
    expect(scene.dots).toHaveLength(0);
  });

  it("skips disabled features", () => {
    const point = { ...createPointFeature({ x: 0.5, y: 0.5 }), enabled: false };
    const scene = buildPaneScene(paneParams({ features: [point] }));
    expect(scene.dots).toHaveLength(0);
  });

  it("reuses memoized TPS grid geometry across rebuilds at the same inputs", () => {
    const features = [
      createPointFeature({ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.25 }),
      createPointFeature({ x: 0.8, y: 0.2 }, { x: 0.7, y: 0.3 }),
      createPointFeature({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.7 }),
    ];
    const settings = defaultAlgorithmSettings().thinPlateSpline;
    const params = paneParams({
      features,
      showFeatures: false,
      grids: { mesh: null, tps: { settings, tq: 0.5 }, beier: null },
    });

    const first = buildPaneScene(params);
    const second = buildPaneScene(params);
    expect(first.lines.length).toBeGreaterThan(0);
    // The cached grid polylines are reused: line endpoints share identity.
    expect(second.lines[0].a).toBe(first.lines[0].a);

    // A different quantized time or features identity computes new geometry.
    const laterT = buildPaneScene({
      ...params,
      grids: { mesh: null, tps: { settings, tq: 0.75 }, beier: null },
    });
    expect(laterT.lines[0].a).not.toBe(first.lines[0].a);
    const newFeatures = buildPaneScene({
      ...params,
      features: features.map((f) => ({ ...f })),
    });
    expect(newFeatures.lines[0].a).not.toBe(first.lines[0].a);
  });

  it("draws every warp grid line over a red halo, halos first", () => {
    const features = [
      createPointFeature({ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.25 }),
      createPointFeature({ x: 0.8, y: 0.2 }, { x: 0.7, y: 0.3 }),
      createPointFeature({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.7 }),
    ];
    const settings = defaultAlgorithmSettings().thinPlateSpline;
    const scene = buildPaneScene(
      paneParams({
        features,
        showFeatures: false,
        grids: { mesh: null, tps: { settings, tq: 0.5 }, beier: null },
      }),
    );
    const half = scene.lines.length / 2;
    expect(Number.isInteger(half) && half > 0).toBe(true);
    for (let i = 0; i < half; i++) {
      const halo = scene.lines[i];
      const line = scene.lines[half + i];
      expect(halo.a).toBe(line.a);
      expect(halo.b).toBe(line.b);
      expect(halo.color.slice(0, 3)).toEqual([1, 0, 0]);
      expect(halo.widthPx).toBe(line.widthPx + 1);
    }
  });

  it("keeps the outline but drops the fill of a self-crossing region", () => {
    const bowTie = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.8 },
    ];
    const region = createRegionFeature(bowTie, bowTie, 0.05);
    const scene = buildPaneScene(paneParams({ features: [region] }));
    expect(scene.fills).toHaveLength(0);
    expect(scene.lines.length).toBeGreaterThan(0);
    expect(scene.dots).toHaveLength(4);
  });
});
