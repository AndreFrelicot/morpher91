import { describe, expect, it } from "vitest";
import { createPointFeature, createRegionFeature } from "./featureFactory";

describe("createPointFeature", () => {
  it("places b at a copy of a by default", () => {
    const a = { x: 0.2, y: 0.7 };
    const f = createPointFeature(a);
    expect(f.kind).toBe("point");
    expect(f.enabled).toBe(true);
    expect(f.a).toEqual(a);
    expect(f.b).toEqual(a);
    // a and b must not share a reference (independent drag of each side).
    expect(f.b).not.toBe(f.a);
    expect(f.a).not.toBe(a);
  });

  it("keeps distinct a/b when both are given", () => {
    const f = createPointFeature({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.8 });
    expect(f.a).toEqual({ x: 0.1, y: 0.1 });
    expect(f.b).toEqual({ x: 0.9, y: 0.8 });
  });

  it("generates unique ids", () => {
    const a = { x: 0.5, y: 0.5 };
    expect(createPointFeature(a).id).not.toBe(createPointFeature(a).id);
  });
});

describe("createRegionFeature", () => {
  it("creates a mirrored polygonal mask with default feather", () => {
    const pts = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ];
    const f = createRegionFeature(pts);
    expect(f.kind).toBe("region");
    expect(f.enabled).toBe(true);
    expect(f.a).toEqual(pts);
    expect(f.b).toEqual(pts);
    expect(f.a).not.toBe(pts);
    expect(f.a[0]).not.toBe(pts[0]);
    expect(f.feather).toBe(0.04);
  });
});
