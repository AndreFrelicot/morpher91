import { describe, expect, it } from "vitest";
import {
  createPointFeature,
  createPolylineFeature,
  createSegmentFeature,
} from "./featureFactory";
import {
  applyHandle,
  applyHandleMirrored,
  appendPolylineVertex,
  featureHandles,
} from "./featureHandles";

describe("featureHandles", () => {
  it("lists one handle per point side", () => {
    const f = createPointFeature({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 });
    expect(featureHandles(f, "a")).toEqual([
      { key: "p", pos: { x: 0.1, y: 0.2 } },
    ]);
    expect(featureHandles(f, "b")).toEqual([
      { key: "p", pos: { x: 0.8, y: 0.9 } },
    ]);
  });

  it("lists two endpoints per segment side", () => {
    const f = createSegmentFeature({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(featureHandles(f, "a").map((h) => h.key)).toEqual(["0", "1"]);
    expect(featureHandles(f, "b")[1].pos).toEqual({ x: 1, y: 1 });
  });

  it("lists one handle per polyline vertex", () => {
    const f = createPolylineFeature([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0 },
    ]);
    expect(featureHandles(f, "a")).toHaveLength(3);
    expect(featureHandles(f, "a")[2]).toEqual({
      key: "2",
      pos: { x: 1, y: 0 },
    });
  });
});

describe("applyHandle", () => {
  it("moves only the addressed side/endpoint", () => {
    const seg = createSegmentFeature({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(applyHandle(seg, "b", "1", { x: 0.4, y: 0.6 })).toEqual({
      b1: { x: 0.4, y: 0.6 },
    });
  });

  it("rewrites the addressed polyline vertex on one side", () => {
    const poly = createPolylineFeature([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
    ]);
    const patch = applyHandle(poly, "a", "1", { x: 0.7, y: 0.2 }) as {
      a: { x: number; y: number }[];
    };
    expect(patch.a).toEqual([
      { x: 0, y: 0 },
      { x: 0.7, y: 0.2 },
    ]);
  });
});

describe("applyHandleMirrored", () => {
  it("moves both sides of a segment endpoint", () => {
    const seg = createSegmentFeature({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(applyHandleMirrored(seg, "1", { x: 0.3, y: 0.9 })).toEqual({
      a1: { x: 0.3, y: 0.9 },
      b1: { x: 0.3, y: 0.9 },
    });
  });
});

describe("appendPolylineVertex", () => {
  it("appends to both sides", () => {
    const poly = createPolylineFeature([{ x: 0, y: 0 }]);
    const patch = appendPolylineVertex(poly, { x: 0.5, y: 0.5 }) as {
      a: { x: number; y: number }[];
      b: { x: number; y: number }[];
    };
    expect(patch.a).toHaveLength(2);
    expect(patch.b).toHaveLength(2);
    expect(patch.a[1]).toEqual({ x: 0.5, y: 0.5 });
  });
});
