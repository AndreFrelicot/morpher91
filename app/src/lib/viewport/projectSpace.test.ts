import { describe, expect, it } from "vitest";
import { containRect, createProjectSpaceTransform } from "./projectSpace";

describe("containRect", () => {
  it("fills the wider axis when outer is taller than the aspect", () => {
    // Square aspect (1) inside a tall 100×200 pane → 100×100 centered.
    expect(containRect(100, 200, 1)).toEqual({
      x: 0,
      y: 50,
      width: 100,
      height: 100,
    });
  });

  it("fills the height when outer is wider than the aspect", () => {
    // Square aspect inside a wide 200×100 pane → 100×100 centered.
    expect(containRect(200, 100, 1)).toEqual({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
    });
  });
});

describe("createProjectSpaceTransform", () => {
  const vp = { zoom: 1, pan: { x: 0, y: 0 } };

  it("maps normalized corners onto the content box", () => {
    const t = createProjectSpaceTransform(200, 100, 1, vp);
    expect(t.toScreen({ x: 0, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(t.toScreen({ x: 1, y: 1 })).toEqual({ x: 150, y: 100 });
    expect(t.toScreen({ x: 0.5, y: 0.5 })).toEqual({ x: 100, y: 50 });
  });

  it("round-trips screen ↔ normalized under zoom and pan", () => {
    const t = createProjectSpaceTransform(300, 220, 4 / 3, {
      zoom: 1.7,
      pan: { x: -25, y: 40 },
    });
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.3, y: 0.85 },
    ]) {
      const back = t.toNormalized(t.toScreen(p));
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });
});
