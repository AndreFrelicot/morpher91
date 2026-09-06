import { describe, expect, it } from "vitest";
import {
  createPointFeature,
  createPolylineFeature,
  createSegmentFeature,
  type BeierNeelySettings,
  type PolylineFeaturePair,
} from "@/morph/model";
import { buildMorphLines } from "./buildMorphLines";

const settings = (
  patch: Partial<BeierNeelySettings> = {},
): BeierNeelySettings => ({
  a: 0.001,
  b: 2,
  p: 0,
  maxLines: 256,
  samplePolylines: true,
  ...patch,
});

describe("buildMorphLines", () => {
  it("turns one segment into one line with paired sides", () => {
    const lines = buildMorphLines(
      [
        createSegmentFeature(
          { x: 0.2, y: 0.5 },
          { x: 0.8, y: 0.5 },
          { x: 0.2, y: 0.7 },
          { x: 0.8, y: 0.7 },
        ),
      ],
      settings(),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].a0).toEqual({ x: 0.2, y: 0.5 });
    expect(lines[0].b1).toEqual({ x: 0.8, y: 0.7 });
    expect(lines[0].weight).toBe(1);
  });

  it("splits a polyline into N-1 consecutive-vertex lines", () => {
    const a = [
      { x: 0.1, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.7, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ];
    const lines = buildMorphLines([createPolylineFeature(a)], settings());
    expect(lines).toHaveLength(3);
    expect(lines[0].a0).toEqual(a[0]);
    expect(lines[0].a1).toEqual(a[1]);
    expect(lines[2].a0).toEqual(a[2]);
    expect(lines[2].a1).toEqual(a[3]);
  });

  it("adds a closing line for a closed polyline (N lines)", () => {
    const a = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ];
    const closed: PolylineFeaturePair = {
      ...createPolylineFeature(a),
      closed: true,
    };
    const lines = buildMorphLines([closed], settings());
    expect(lines).toHaveLength(3);
    // last line wraps the final vertex back to the first
    expect(lines[2].a0).toEqual(a[2]);
    expect(lines[2].a1).toEqual(a[0]);
  });

  it("does not contribute polylines when sampling is disabled", () => {
    const a = [
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ];
    const lines = buildMorphLines(
      [createPolylineFeature(a)],
      settings({ samplePolylines: false }),
    );
    expect(lines).toHaveLength(0);
  });

  it("ignores points, regions and disabled features", () => {
    const disabled = createSegmentFeature({ x: 0, y: 0 }, { x: 1, y: 1 });
    disabled.enabled = false;
    const lines = buildMorphLines(
      [createPointFeature({ x: 0.5, y: 0.5 }), disabled],
      settings(),
    );
    expect(lines).toHaveLength(0);
  });

  it("caps the result at maxLines", () => {
    const a = Array.from({ length: 20 }, (_, i) => ({ x: i / 20, y: 0.5 }));
    const lines = buildMorphLines(
      [createPolylineFeature(a)], // 19 segments
      settings({ maxLines: 5 }),
    );
    expect(lines).toHaveLength(5);
  });
});
