import { describe, expect, it } from "vitest";
import {
  packFrameUniform,
  projectToClip,
  projectToCss,
  pxToClip,
  type OverlayFrame,
} from "./overlayTransform";

const frame: OverlayFrame = {
  content: { x: 100, y: 50, width: 400, height: 300 },
  cssWidth: 600,
  cssHeight: 400,
};

describe("overlayTransform", () => {
  it("maps project space to CSS pixels inside the content box", () => {
    expect(projectToCss(frame, 0, 0)).toEqual({ x: 100, y: 50 });
    expect(projectToCss(frame, 1, 1)).toEqual({ x: 500, y: 350 });
    expect(projectToCss(frame, 0.5, 0.5)).toEqual({ x: 300, y: 200 });
  });

  it("maps project space to clip space with y flipped", () => {
    // Centre of the content box.
    const c = projectToClip(frame, 0.5, 0.5);
    expect(c.x).toBeCloseTo((300 / 600) * 2 - 1, 6); // 0
    expect(c.y).toBeCloseTo(1 - (200 / 400) * 2, 6); // 0

    const topLeft = projectToClip(frame, 0, 0);
    expect(topLeft.x).toBeCloseTo(100 / 600 / 0.5 - 1, 6);
    expect(topLeft.y).toBeGreaterThan(0); // top of screen → positive clip y
  });

  it("derives a devicePixelRatio-independent px→clip scale", () => {
    expect(pxToClip(frame)).toEqual({ x: 2 / 600, y: 2 / 400 });
  });

  it("packs the frame uniform in the documented layout", () => {
    const u = packFrameUniform(frame);
    expect(u).toHaveLength(8);
    expect([...u.slice(0, 6)]).toEqual([100, 50, 400, 300, 600, 400]);
  });
});
