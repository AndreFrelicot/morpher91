/**
 * CSS-style `cubic-bezier(x1, y1, x2, y2)` timing functions. The curve runs
 * from (0,0) to (1,1) with the two handles given; evaluating it at a time x
 * means solving x(u) = x for the parameter u, then returning y(u).
 */

/** Newton converges in two or three steps here; the cap only guards flat spans. */
const NEWTON_ITERATIONS = 8;
const NEWTON_EPSILON = 1e-7;
/** Bisection fallback, used when the derivative is too flat for Newton. */
const BISECTION_ITERATIONS = 32;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Bernstein form of a 1-D cubic Bézier with endpoints 0 and 1. */
const evalAxis = (u: number, p1: number, p2: number): number => {
  const inv = 1 - u;
  return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u;
};

const evalAxisDerivative = (u: number, p1: number, p2: number): number => {
  const inv = 1 - u;
  return 3 * inv * inv * p1 + 6 * inv * u * (p2 - p1) + 3 * u * u * (1 - p2);
};

/** Solves x(u) = x for u ∈ [0,1] (Newton, then bisection if it stalls). */
function solveForU(x: number, x1: number, x2: number): number {
  let u = x;
  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const error = evalAxis(u, x1, x2) - x;
    if (Math.abs(error) < NEWTON_EPSILON) return u;
    const slope = evalAxisDerivative(u, x1, x2);
    if (Math.abs(slope) < NEWTON_EPSILON) break;
    u -= error / slope;
  }

  let low = 0;
  let high = 1;
  u = x;
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const value = evalAxis(u, x1, x2);
    if (Math.abs(value - x) < NEWTON_EPSILON) return u;
    if (value < x) low = u;
    else high = u;
    u = (low + high) / 2;
  }
  return u;
}

/**
 * Builds the easing function of a cubic-bezier curve. Control-point x values
 * are clamped to 0..1 so the curve stays a function of time (as CSS requires);
 * y is clamped too — v1 has no overshoot.
 */
export function cubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx1 = clamp01(x1);
  const cx2 = clamp01(x2);
  const cy1 = clamp01(y1);
  const cy2 = clamp01(y2);
  // The identity curve needs no solve.
  if (cx1 === cy1 && cx2 === cy2) return clamp01;
  return (t: number) => {
    const x = clamp01(t);
    if (x === 0 || x === 1) return x;
    return clamp01(evalAxis(solveForU(x, cx1, cx2), cy1, cy2));
  };
}
