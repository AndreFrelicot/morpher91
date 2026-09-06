import { describe, expect, it } from "vitest";
import {
  createPointFeature,
  createPolylineFeature,
  type TpsSettings,
} from "@/morph/model";
import { collectTpsLandmarks } from "./collectLandmarks";

const settings = (patch: Partial<TpsSettings> = {}): TpsSettings => ({
  lambda: 0.001,
  borderAnchors: true,
  borderAnchorCount: 8,
  samplePolylines: true,
  polylineSampleSpacing: 0.03,
  showGrid: false,
  ...patch,
});

describe("collectTpsLandmarks", () => {
  it("collects point features paired A/B", () => {
    const lm = collectTpsLandmarks(
      [
        createPointFeature({ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }),
        createPointFeature({ x: 0.7, y: 0.6 }, { x: 0.6, y: 0.4 }),
      ],
      settings({ borderAnchors: false, samplePolylines: false }),
    );
    expect(lm.count).toBe(2);
    expect(lm.a[0]).toBeCloseTo(0.2);
    expect(lm.a[1]).toBeCloseTo(0.3);
    expect(lm.b[0]).toBeCloseTo(0.4);
    expect(lm.b[1]).toBeCloseTo(0.5);
  });

  it("appends border anchors at the same position on both sides", () => {
    const lm = collectTpsLandmarks(
      [],
      settings({ borderAnchorCount: 4, samplePolylines: false }),
    );
    expect(lm.count).toBe(4 + 4 * 4); // corners + edges
    for (let i = 0; i < lm.count; i++) {
      expect(lm.a[i * 2]).toBeCloseTo(lm.b[i * 2]);
      expect(lm.a[i * 2 + 1]).toBeCloseTo(lm.b[i * 2 + 1]);
    }
  });

  it("ignores disabled features", () => {
    const disabled = createPointFeature({ x: 0.5, y: 0.5 });
    disabled.enabled = false;
    const lm = collectTpsLandmarks(
      [disabled],
      settings({ borderAnchors: false, samplePolylines: false }),
    );
    expect(lm.count).toBe(0);
  });

  it("samples polylines into paired landmarks", () => {
    // Horizontal A line (length 0.6), spacing 0.1 → ~7 samples; B mirrors it.
    const a = [
      { x: 0.2, y: 0.5 },
      { x: 0.8, y: 0.5 },
    ];
    const b = [
      { x: 0.2, y: 0.7 },
      { x: 0.8, y: 0.7 },
    ];
    const lm = collectTpsLandmarks(
      [createPolylineFeature(a, b)],
      settings({ borderAnchors: false, polylineSampleSpacing: 0.1 }),
    );
    expect(lm.count).toBe(7);
    // Endpoints land on the polyline ends; midpoint at the centre.
    expect(lm.a[0]).toBeCloseTo(0.2);
    expect(lm.a[(lm.count - 1) * 2]).toBeCloseTo(0.8);
    expect(lm.b[1]).toBeCloseTo(0.7); // B side y
  });

  it("does not sample polylines when disabled", () => {
    const lm = collectTpsLandmarks(
      [
        createPolylineFeature([
          { x: 0.2, y: 0.5 },
          { x: 0.8, y: 0.5 },
        ]),
      ],
      settings({ borderAnchors: false, samplePolylines: false }),
    );
    expect(lm.count).toBe(0);
  });
});
