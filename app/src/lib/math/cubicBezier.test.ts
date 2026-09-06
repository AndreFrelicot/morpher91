import { describe, expect, it } from "vitest";
import { cubicBezierEase } from "./cubicBezier";

/**
 * CSS `ease` = cubic-bezier(0.25, 0.1, 0.25, 1) at t = 0, 0.1 … 1, solved
 * independently by 200 bisection steps on the Bernstein form.
 */
const CSS_EASE = [
  0, 0.0948, 0.29524, 0.51332, 0.68254, 0.8024, 0.88523, 0.94076, 0.97563,
  0.99432, 1,
];

describe("cubicBezierEase", () => {
  it("pins the endpoints", () => {
    const ease = cubicBezierEase(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("is the identity for (0, 0, 1, 1)", () => {
    const ease = cubicBezierEase(0, 0, 1, 1);
    for (let i = 0; i <= 10; i++) expect(ease(i / 10)).toBeCloseTo(i / 10, 12);
  });

  it("matches CSS `ease` on eleven samples", () => {
    const ease = cubicBezierEase(0.25, 0.1, 0.25, 1);
    CSS_EASE.forEach((expected, index) => {
      expect(ease(index / 10)).toBeCloseTo(expected, 3);
    });
  });

  it("reproduces smoothstep as cubic-bezier(1/3, 0, 2/3, 1)", () => {
    const ease = cubicBezierEase(1 / 3, 0, 2 / 3, 1);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(ease(t)).toBeCloseTo(t * t * (3 - 2 * t), 5);
    }
  });

  it("stays monotonic in x and inside 0..1", () => {
    const ease = cubicBezierEase(0.9, 0.05, 0.1, 0.95);
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const value = ease(i / 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("inverts x(u) so that ease(x(u)) === y(u)", () => {
    const bernstein = (u: number, p1: number, p2: number) => {
      const inv = 1 - u;
      return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u;
    };
    const [x1, y1, x2, y2] = [0.68, 0.12, 0.31, 0.94];
    const ease = cubicBezierEase(x1, y1, x2, y2);
    for (let i = 1; i < 20; i++) {
      const u = i / 20;
      expect(ease(bernstein(u, x1, x2))).toBeCloseTo(bernstein(u, y1, y2), 5);
    }
  });

  it("clamps out-of-range handles and times", () => {
    const ease = cubicBezierEase(-1, 2, 3, -4);
    expect(ease(-0.5)).toBe(0);
    expect(ease(1.5)).toBe(1);
  });
});
