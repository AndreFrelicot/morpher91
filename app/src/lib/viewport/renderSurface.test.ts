import { describe, expect, it } from "vitest";
import {
  fitBackingSize,
  fitViewportBackingSize,
  MAX_CONSTRAINED_VIEWPORT_EDGE,
} from "./renderSurface";

describe("fitBackingSize", () => {
  it("uses DPR when the surface is below the cap", () => {
    expect(fitBackingSize(320, 200, 2, 1536)).toEqual({
      width: 640,
      height: 400,
    });
  });

  it("downscales uniformly when the width hits the cap", () => {
    expect(fitBackingSize(1200, 800, 2, 1536)).toEqual({
      width: 1536,
      height: 1024,
    });
  });

  it("downscales uniformly when the height hits the cap", () => {
    expect(fitBackingSize(800, 1200, 2, 1536)).toEqual({
      width: 1024,
      height: 1536,
    });
  });
});

describe("fitViewportBackingSize", () => {
  it("caps a DPR 3 desktop surface at the shared DPR limit", () => {
    expect(
      fitViewportBackingSize(400, 300, {
        devicePixelRatio: 3,
        constrained: false,
        highFeatureCount: false,
      }),
    ).toEqual({ width: 800, height: 600 });
  });

  it("caps a wide touch surface at the constrained edge", () => {
    expect(
      fitViewportBackingSize(1366, 1024, {
        devicePixelRatio: 2,
        constrained: true,
        highFeatureCount: false,
      }),
    ).toEqual({
      width: MAX_CONSTRAINED_VIEWPORT_EDGE,
      height: 768,
    });
  });

  it("halves the constrained budget for a complex project", () => {
    expect(
      fitViewportBackingSize(1024, 1366, {
        devicePixelRatio: 2,
        constrained: true,
        highFeatureCount: true,
      }),
    ).toEqual({ width: 384, height: 512 });
  });
});
