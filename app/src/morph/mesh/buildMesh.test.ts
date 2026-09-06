import { describe, expect, it } from "vitest";
import { createPointFeature } from "@/morph/model";
import type { MeshSettings } from "@/morph/model";
import { buildBorderAnchors } from "./buildBorderAnchors";
import { buildMesh } from "./buildMesh";

const settings = (patch: Partial<MeshSettings> = {}): MeshSettings => ({
  borderAnchors: true,
  borderAnchorCount: 8,
  showWireframe: false,
  ...patch,
});

describe("buildBorderAnchors", () => {
  it("produces 4 + 4*edgesPerSide anchors", () => {
    expect(buildBorderAnchors({ edgesPerSide: 0 })).toHaveLength(4);
    expect(buildBorderAnchors({ edgesPerSide: 8 })).toHaveLength(36);
  });

  it("keeps every anchor inside [0,1]² and on a border", () => {
    for (const p of buildBorderAnchors({ edgesPerSide: 4 })) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
      const onBorder = p.x === 0 || p.x === 1 || p.y === 0 || p.y === 1;
      expect(onBorder).toBe(true);
    }
  });

  it("omits corners when disabled", () => {
    expect(
      buildBorderAnchors({ corners: false, edgesPerSide: 3 }),
    ).toHaveLength(12);
  });
});

describe("buildMesh", () => {
  it("triangulates border anchors alone (no user points ≈ crossfade)", () => {
    const mesh = buildMesh([], settings({ borderAnchorCount: 8 }));
    expect(mesh.pointsMid).toHaveLength(36 * 2);
    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.triangles.length % 3).toBe(0);
  });

  it("returns a valid triangulation with user points", () => {
    const features = [
      createPointFeature({ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.5 }),
      createPointFeature({ x: 0.7, y: 0.6 }, { x: 0.6, y: 0.4 }),
    ];
    const mesh = buildMesh(features, settings({ borderAnchorCount: 4 }));
    const n = mesh.pointsMid.length / 2;
    expect(n).toBe(2 + (4 + 4 * 4));
    expect(mesh.triangles.length % 3).toBe(0);
    for (const idx of mesh.triangles) {
      expect(idx).toBeLessThan(n);
    }
  });

  it("sets midpoints to the average of A and B", () => {
    const mesh = buildMesh(
      [createPointFeature({ x: 0.2, y: 0.8 }, { x: 0.6, y: 0.4 })],
      settings({ borderAnchors: false }),
    );
    expect(mesh.pointsMid[0]).toBeCloseTo(0.4);
    expect(mesh.pointsMid[1]).toBeCloseTo(0.6);
  });

  it("ignores disabled point features", () => {
    const disabled = createPointFeature({ x: 0.5, y: 0.5 });
    disabled.enabled = false;
    const mesh = buildMesh([disabled], settings({ borderAnchorCount: 0 }));
    expect(mesh.pointsMid).toHaveLength(4 * 2); // corners only
  });

  it("produces no degenerate (zero-area) triangles", () => {
    const mesh = buildMesh(
      [
        createPointFeature({ x: 0.35, y: 0.45 }, { x: 0.45, y: 0.35 }),
        createPointFeature({ x: 0.6, y: 0.55 }, { x: 0.5, y: 0.65 }),
      ],
      settings({ borderAnchorCount: 6 }),
    );
    const { pointsMid, triangles } = mesh;
    for (let i = 0; i < triangles.length; i += 3) {
      const ax = pointsMid[triangles[i] * 2];
      const ay = pointsMid[triangles[i] * 2 + 1];
      const bx = pointsMid[triangles[i + 1] * 2];
      const by = pointsMid[triangles[i + 1] * 2 + 1];
      const cx = pointsMid[triangles[i + 2] * 2];
      const cy = pointsMid[triangles[i + 2] * 2 + 1];
      const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
      expect(area).toBeGreaterThan(1e-9);
    }
  });
});
