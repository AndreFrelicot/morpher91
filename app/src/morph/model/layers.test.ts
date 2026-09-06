import { describe, expect, it } from "vitest";
import {
  canAddUserLayer,
  createLayer,
  createPointFeature,
  createProject,
  createRegionFeature,
  defaultGlobalLayer,
  defaultPlacement,
  effectiveLayerAlgorithm,
  featuresForLayer,
  layerContribution,
  layerContributesToRender,
  layerTransitionAt,
  transitionAtProgress,
  easeTimeline,
  MAX_USER_LAYERS,
  normalizeLayerClip,
  projectForLayer,
  sortLayers,
  visibleFeatures,
  type ImageAsset,
} from "./index";

function image(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 512,
    height: 512,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
}

/** Pushes a user layer with an explicit clip onto the project. */
function clippedLayer(
  project: ReturnType<typeof createProject>,
  clip: { startSec: number; durationSec: number },
) {
  const layer = createLayer("Face", 1);
  layer.clip = clip;
  project.layers.push(layer);
  return layer;
}

describe("layers", () => {
  it("creates user layers separate from the global layer", () => {
    const layer = createLayer("Face", 2);
    expect(layer.id).not.toBe("global");
    expect(layer.name).toBe("Face");
    expect(layer.zIndex).toBe(2);
    expect(layer.featureIds).toEqual([]);
    expect(layer.timing.easing).toBe("smoothstep");
  });

  it("sorts layers by zIndex and caps user layers", () => {
    const global = defaultGlobalLayer();
    const layers = [
      createLayer("Hair", 3),
      global,
      createLayer("Face", 1),
      createLayer("Bg", 2),
    ];
    expect(sortLayers(layers).map((layer) => layer.name)).toEqual([
      "Global",
      "Face",
      "Bg",
      "Hair",
    ]);
    expect(canAddUserLayer(layers)).toBe(true);

    const atCap = [
      global,
      ...Array.from({ length: MAX_USER_LAYERS }, (_, i) =>
        createLayer(`L${i}`, i + 1),
      ),
    ];
    expect(canAddUserLayer(atCap)).toBe(false);
  });

  it("filters features for a layer and applies algorithm overrides", () => {
    const project = createProject(image("a"), image("b"));
    const face = createLayer("Face", 1);
    face.algorithmOverride = "beier-neely";
    const point = createPointFeature({ x: 0.2, y: 0.3 });
    const other = createPointFeature({ x: 0.7, y: 0.8 });
    point.layerId = face.id;
    project.features = [point, other];
    project.layers.push(face);

    expect(featuresForLayer(project, face)).toEqual([point]);
    expect(featuresForLayer(project, project.layers[0])).toEqual([other]);
    const layerProject = projectForLayer(project, face);
    expect(layerProject.features).toEqual([point]);
    expect(layerProject.activeAlgorithm).toBe("beier-neely");
    expect(project.activeAlgorithm).toBe("crossfade");
  });

  it("describes how layers contribute to the render stack", () => {
    const project = createProject(image("a"), image("b"));
    project.activeAlgorithm = "thin-plate-spline";
    const empty = createLayer("Empty", 1);
    const face = createLayer("Face", 2);
    face.algorithmOverride = "mesh";
    const point = createPointFeature({ x: 0.2, y: 0.3 });
    point.layerId = face.id;
    const masked = createLayer("Masked", 3);
    const region = createRegionFeature([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ]);
    masked.mask = { featureId: region.id, mode: "hard", feather: 0 };
    project.features = [point, region];
    project.layers.push(empty, face, masked);

    expect(effectiveLayerAlgorithm(project, face)).toBe("mesh");
    expect(effectiveLayerAlgorithm(project, masked)).toBe("thin-plate-spline");
    expect(layerContribution(project, empty).status).toBe("no-contribution");
    expect(layerContributesToRender(project, empty)).toBe(false);
    expect(layerContribution(project, face).status).toBe("full-frame");
    expect(layerContribution(project, masked).status).toBe("masked");
  });

  it("treats a brush-painted mask as a masked contribution (M11 lot 3)", () => {
    const project = createProject(image("a"), image("b"));
    const painted = createLayer("Painted", 1);
    painted.paintedMask = { width: 4, height: 4, data: "EAE=" };
    project.layers.push(painted);

    const contribution = layerContribution(project, painted);
    expect(contribution.status).toBe("masked");
    expect(contribution.hasMask).toBe(true);
    expect(layerContributesToRender(project, painted)).toBe(true);
  });

  it("keeps hidden layers and disabled features out of preview participation", () => {
    const project = createProject(image("a"), image("b"));
    const layer = createLayer("Face", 1);
    const layerPoint = createPointFeature({ x: 0.2, y: 0.3 });
    const disabledPoint = createPointFeature({ x: 0.4, y: 0.5 });
    const globalPoint = createPointFeature({ x: 0.7, y: 0.8 });
    layerPoint.layerId = layer.id;
    disabledPoint.enabled = false;
    project.features = [layerPoint, disabledPoint, globalPoint];
    project.layers.push({ ...layer, visible: false });

    expect(visibleFeatures(project)).toEqual([globalPoint]);
  });

  it("activates layers only inside their timeline clip", () => {
    const project = createProject(image("a"), image("b"));
    project.timeline.durationSec = 8;
    const layer = clippedLayer(project, { startSec: 2, durationSec: 4 });
    layer.timing.easing = "linear";
    const point = createPointFeature({ x: 0.2, y: 0.3 });
    point.layerId = layer.id;
    project.features = [point];

    expect(layerContributesToRender(project, layer, 1.9)).toBe(false);
    expect(layerContribution(project, layer, 1.9).status).toBe("outside-clip");
    expect(layerContributesToRender(project, layer, 2)).toBe(true);
    expect(layerTransitionAt(project, layer, 4).warpT).toBeCloseTo(0.5);
    expect(layerTransitionAt(project, layer, 6).warpT).toBe(1);
  });

  it("normalizes layer clips inside the master timeline", () => {
    expect(normalizeLayerClip({ startSec: 7, durationSec: 4 }, 8)).toEqual({
      startSec: 7,
      durationSec: 1,
    });
  });
});

describe("layerTransitionAt", () => {
  it("keeps warp and dissolve equal for the default 0..1 windows", () => {
    const project = createProject(image("a"), image("b"));
    const layer = clippedLayer(project, { startSec: 0, durationSec: 4 });

    for (const tauSec of [0, 1, 2, 3, 4]) {
      const { warpT, dissolveT } = layerTransitionAt(project, layer, tauSec);
      const progress = tauSec / 4;
      expect(warpT).toBeCloseTo(easeTimeline(progress, "smoothstep"));
      expect(dissolveT).toBe(warpT);
    }
  });

  it("holds the dissolve outside its window while the warp advances", () => {
    const project = createProject(image("a"), image("b"));
    const layer = clippedLayer(project, { startSec: 0, durationSec: 10 });
    layer.timing = {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0.4,
      dissolveEnd: 0.6,
      easing: "linear",
    };

    expect(layerTransitionAt(project, layer, 3)).toEqual({
      warpT: 0.3,
      dissolveT: 0,
    });
    expect(layerTransitionAt(project, layer, 5).dissolveT).toBeCloseTo(0.5);
    expect(layerTransitionAt(project, layer, 7)).toEqual({
      warpT: 0.7,
      dissolveT: 1,
    });
  });

  it("eases each window on its own remapped progress", () => {
    const project = createProject(image("a"), image("b"));
    const layer = clippedLayer(project, { startSec: 0, durationSec: 4 });
    layer.timing = {
      warpStart: 0.25,
      warpEnd: 0.75,
      dissolveStart: 0,
      dissolveEnd: 1,
      easing: "ease-in",
    };

    // τ=2 → progress 0.5 → warp window 0.5, dissolve window 0.5.
    const at2 = layerTransitionAt(project, layer, 2);
    expect(at2.warpT).toBeCloseTo(0.25);
    expect(at2.dissolveT).toBeCloseTo(0.25);
    // τ=1 → progress 0.25 → warp window 0, dissolve window 0.25.
    const at1 = layerTransitionAt(project, layer, 1);
    expect(at1.warpT).toBe(0);
    expect(at1.dissolveT).toBeCloseTo(0.0625);
  });

  it("accepts a bezier curve, and a distinct one for the dissolve", () => {
    const project = createProject(image("a"), image("b"));
    const layer = clippedLayer(project, { startSec: 0, durationSec: 4 });
    layer.timing = {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0,
      dissolveEnd: 1,
      // smoothstep, expressed as a curve.
      easing: { kind: "bezier", x1: 1 / 3, y1: 0, x2: 2 / 3, y2: 1 },
      dissolveEasing: "linear",
    };

    const { warpT, dissolveT } = layerTransitionAt(project, layer, 1);
    expect(warpT).toBeCloseTo(easeTimeline(0.25, "smoothstep"), 5);
    expect(dissolveT).toBeCloseTo(0.25);
  });

  it("turns a degenerate window into a step at its end", () => {
    const project = createProject(image("a"), image("b"));
    const layer = clippedLayer(project, { startSec: 0, durationSec: 4 });
    layer.timing = {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0.5,
      dissolveEnd: 0.5,
      easing: "linear",
    };

    expect(layerTransitionAt(project, layer, 1.9).dissolveT).toBe(0);
    expect(layerTransitionAt(project, layer, 2).dissolveT).toBe(1);
    expect(layerTransitionAt(project, layer, 3).dissolveT).toBe(1);
  });
});

describe("transitionAtProgress", () => {
  it("is the clip-independent half of layerTransitionAt", () => {
    const project = createProject(image("a"), image("b"));
    const layer = clippedLayer(project, { startSec: 2, durationSec: 4 });
    layer.timing = {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0.3,
      dissolveEnd: 0.7,
      easing: "ease-in",
      dissolveEasing: "linear",
    };

    for (const progress of [0, 0.25, 0.5, 0.8, 1]) {
      expect(transitionAtProgress(layer.timing, progress)).toEqual(
        layerTransitionAt(project, layer, 2 + progress * 4),
      );
    }
  });
});
