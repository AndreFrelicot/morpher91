import type { Vec2 } from "@/morph/model";
import type { MorphLine } from "./buildMorphLines";

/** Beier–Neely weight coefficients (PRD §10.5): a, b, p. */
export type BeierCoeffs = { a: number; b: number; p: number };

/** Matches WGSL `0.000001` guards in beierNeely.wgsl. */
const EPS = 0.000001;

export function perp(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const len = (v: Vec2): number => Math.hypot(v.x, v.y);
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Maps `x` from the line frame (p,q) to the line frame (p2,q2), the Beier–Neely
 * single-line mapping (PRD §10.5). `u` is the position along the line, `v` the
 * signed perpendicular distance.
 */
export function mapPointByLinePair(
  x: Vec2,
  p: Vec2,
  q: Vec2,
  p2: Vec2,
  q2: Vec2,
): Vec2 {
  const pq = sub(q, p);
  // Guard the squared length too (equals dot(pq,pq) for non-degenerate lines)
  // so a zero-length intermediate line maps to p2 instead of producing NaN.
  const pqLen = Math.max(len(pq), EPS);

  const u = dot(sub(x, p), pq) / (pqLen * pqLen);
  const v = dot(sub(x, p), perp(pq)) / pqLen;

  const p2q2 = sub(q2, p2);
  const p2q2Len = Math.max(len(p2q2), EPS);
  const perpP2q2 = perp(p2q2);

  return {
    x: p2.x + u * p2q2.x + (v * perpP2q2.x) / p2q2Len,
    y: p2.y + u * p2q2.y + (v * perpP2q2.y) / p2q2Len,
  };
}

/** Distance from `x` to the segment (p,q), clamped to the endpoints. */
export function lineDistance(x: Vec2, p: Vec2, q: Vec2): number {
  const pq = sub(q, p);
  const len2 = dot(pq, pq);
  if (len2 < EPS) return dist(x, p);

  const u = dot(sub(x, p), pq) / len2;
  if (u < 0) return dist(x, p);
  if (u > 1) return dist(x, q);

  const projection = { x: p.x + u * pq.x, y: p.y + u * pq.y };
  return dist(x, projection);
}

/** Weight of a line at distance `d` and intermediate length `l` (PRD §10.5). */
function lineWeight(
  line: MorphLine,
  l: number,
  d: number,
  c: BeierCoeffs,
): number {
  return Math.pow(Math.pow(l, c.p) / (c.a + d), c.b) * line.weight;
}

/**
 * Backward warp of an intermediate point `x` (at time `t`) onto image A,
 * the exact CPU mirror of `warp_both`/`map_point_by_line_pair` in
 * beierNeely.wgsl (PRD §10.5). With no lines, returns `x` (identity).
 */
export function warpToA(
  x: Vec2,
  lines: MorphLine[],
  t: number,
  c: BeierCoeffs,
): Vec2 {
  return warp(x, lines, t, c, (line) => ({ p: line.a0, q: line.a1 }));
}

/** Backward warp of an intermediate point onto image B (mirror of {@link warpToA}). */
export function warpToB(
  x: Vec2,
  lines: MorphLine[],
  t: number,
  c: BeierCoeffs,
): Vec2 {
  return warp(x, lines, t, c, (line) => ({ p: line.b0, q: line.b1 }));
}

function warp(
  x: Vec2,
  lines: MorphLine[],
  t: number,
  c: BeierCoeffs,
  side: (line: MorphLine) => { p: Vec2; q: Vec2 },
): Vec2 {
  let totalX = 0;
  let totalY = 0;
  let totalWeight = 0;

  for (const line of lines) {
    const m0 = {
      x: line.a0.x + (line.b0.x - line.a0.x) * t,
      y: line.a0.y + (line.b0.y - line.a0.y) * t,
    };
    const m1 = {
      x: line.a1.x + (line.b1.x - line.a1.x) * t,
      y: line.a1.y + (line.b1.y - line.a1.y) * t,
    };

    const { p, q } = side(line);
    const mapped = mapPointByLinePair(x, m0, m1, p, q);

    const d = lineDistance(x, m0, m1);
    const l = len(sub(m1, m0));
    const w = lineWeight(line, l, d, c);

    totalX += (mapped.x - x.x) * w;
    totalY += (mapped.y - x.y) * w;
    totalWeight += w;
  }

  if (totalWeight <= EPS) return { ...x };
  return { x: x.x + totalX / totalWeight, y: x.y + totalY / totalWeight };
}
