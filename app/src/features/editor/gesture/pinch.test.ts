import { describe, expect, it } from "vitest";
import {
  beginPinch,
  updatePinch,
  wheelZoomFactor,
  type TwoPointers,
} from "./pinch";

// A 200x100 pane holding a 2:1 project fills the whole pane at zoom 1
// (contain box = the pane), so normalized→screen is a clean linear map.
const PANE_W = 200;
const PANE_H = 100;
const ASPECT = 2;
const START: TwoPointers = { a: { x: 80, y: 50 }, b: { x: 120, y: 50 } };

describe("pinch", () => {
  it("keeps zoom at 1 when the fingers don't move", () => {
    const anchor = beginPinch(START, PANE_W, PANE_H, ASPECT, {
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    const vp = updatePinch(anchor, START);
    expect(vp.zoom).toBeCloseTo(1, 5);
    expect(vp.pan.x).toBeCloseTo(0, 5);
    expect(vp.pan.y).toBeCloseTo(0, 5);
  });

  it("scales zoom by the finger-distance ratio", () => {
    const anchor = beginPinch(START, PANE_W, PANE_H, ASPECT, {
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    // Spread from 40px apart to 80px apart around the same centroid ⇒ 2x zoom.
    const spread: TwoPointers = { a: { x: 60, y: 50 }, b: { x: 140, y: 50 } };
    const vp = updatePinch(anchor, spread);
    expect(vp.zoom).toBeCloseTo(2, 5);
  });

  it("pins the anchored point under a moving centroid (two-finger pan)", () => {
    const anchor = beginPinch(START, PANE_W, PANE_H, ASPECT, {
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    // Translate both fingers +30x/+10y without changing their spacing.
    const moved: TwoPointers = { a: { x: 110, y: 60 }, b: { x: 150, y: 60 } };
    const vp = updatePinch(anchor, moved);
    expect(vp.zoom).toBeCloseTo(1, 5);
    // Pure translation ⇒ pan equals the centroid delta.
    expect(vp.pan.x).toBeCloseTo(30, 5);
    expect(vp.pan.y).toBeCloseTo(10, 5);
  });

  it("clamps zoom to the allowed range", () => {
    const anchor = beginPinch(START, PANE_W, PANE_H, ASPECT, {
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    const tiny: TwoPointers = { a: { x: 99, y: 50 }, b: { x: 101, y: 50 } };
    const huge: TwoPointers = { a: { x: 0, y: 50 }, b: { x: 200, y: 50 } };
    expect(updatePinch(anchor, huge).zoom).toBeLessThanOrEqual(8);
    // 2px / 40px = 0.05 ⇒ would be below MIN_ZOOM 0.25.
    expect(updatePinch(anchor, tiny).zoom).toBeCloseTo(0.25, 5);
  });

  it("scales the wheel factor with the delta (trackpad-friendly)", () => {
    // A gentle trackpad tick (small pixel delta) must barely zoom…
    const gentle = wheelZoomFactor({ deltaY: 5, deltaMode: 0, ctrlKey: false });
    expect(gentle).toBeLessThan(1);
    expect(gentle).toBeGreaterThan(0.98);
    // …while a full mouse-wheel notch zooms a real step.
    const notch = wheelZoomFactor({
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: false,
    });
    expect(notch).toBeCloseTo(Math.exp(0.22), 5);
    // Direction follows the sign of the delta.
    expect(
      wheelZoomFactor({ deltaY: -5, deltaMode: 0, ctrlKey: false }),
    ).toBeGreaterThan(1);
  });

  it("boosts pinch-wheel (ctrlKey) and normalizes line-mode deltas", () => {
    const scroll = wheelZoomFactor({
      deltaY: -10,
      deltaMode: 0,
      ctrlKey: false,
    });
    const pinchWheel = wheelZoomFactor({
      deltaY: -10,
      deltaMode: 0,
      ctrlKey: true,
    });
    expect(pinchWheel).toBeGreaterThan(scroll);
    // Firefox mouse wheels report LINE deltas (±3): one notch ≈ 48px.
    const line = wheelZoomFactor({ deltaY: -3, deltaMode: 1, ctrlKey: false });
    expect(line).toBeCloseTo(
      wheelZoomFactor({ deltaY: -48, deltaMode: 0, ctrlKey: false }),
      5,
    );
  });

  it("caps the factor of a single wheel fling", () => {
    expect(
      wheelZoomFactor({ deltaY: -5000, deltaMode: 0, ctrlKey: false }),
    ).toBeCloseTo(Math.exp(0.5), 5);
    expect(
      wheelZoomFactor({ deltaY: 5000, deltaMode: 0, ctrlKey: true }),
    ).toBeCloseTo(Math.exp(-0.5), 5);
  });

  it("keeps the pinched project point stationary under the centroid while zooming", () => {
    const anchor = beginPinch(START, PANE_W, PANE_H, ASPECT, {
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
    // Spread around the SAME centroid (100,50): that screen point must map to the
    // same project point before and after — i.e. it stays put on screen.
    const spread: TwoPointers = { a: { x: 70, y: 50 }, b: { x: 130, y: 50 } };
    const vp = updatePinch(anchor, spread);
    // Reconstruct the content box and check the centroid's normalized coord.
    const w = PANE_W * vp.zoom;
    const x = (PANE_W - w) / 2 + vp.pan.x;
    const nx = (100 - x) / w;
    expect(nx).toBeCloseTo(0.5, 5); // centroid was the project center
  });
});
