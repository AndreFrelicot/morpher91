import type { Vec2 } from "@/morph/model";

const EPS = 1e-12;

/** Twice the signed area of the ring (CCW positive). */
function signedArea2(points: Vec2[]): number {
  let a = 0;
  for (let p = points.length - 1, q = 0; q < points.length; p = q++) {
    a += points[p].x * points[q].y - points[q].x * points[p].y;
  }
  return a;
}

/** Barycentric point-in-triangle test (inclusive of edges). */
function insideTriangle(a: Vec2, b: Vec2, c: Vec2, p: Vec2): boolean {
  const ax = c.x - b.x;
  const ay = c.y - b.y;
  const bx = a.x - c.x;
  const by = a.y - c.y;
  const cx = b.x - a.x;
  const cy = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const bpx = p.x - b.x;
  const bpy = p.y - b.y;
  const cpx = p.x - c.x;
  const cpy = p.y - c.y;
  const aCross = ax * bpy - ay * bpx;
  const cCross = cx * apy - cy * apx;
  const bCross = bx * cpy - by * cpx;
  return aCross >= 0 && bCross >= 0 && cCross >= 0;
}

/** True when (u,v,w) forms a convex ear containing no other vertex. */
function isEar(
  points: Vec2[],
  v: number[],
  n: number,
  u: number,
  vi: number,
  w: number,
): boolean {
  const a = points[v[u]];
  const b = points[v[vi]];
  const c = points[v[w]];
  // Convex corner in a CCW ring.
  if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < EPS) return false;
  for (let p = 0; p < n; p++) {
    if (p === u || p === vi || p === w) continue;
    if (insideTriangle(a, b, c, points[v[p]])) return false;
  }
  return true;
}

/**
 * Ear-clipping triangulation of a simple polygon (PRD M11 overlay fills). Works
 * for convex and concave rings; winding is normalized to CCW so the ear test has
 * a consistent sign. Returns flat index triples into `points` (CCW). Degenerate
 * input (<3 points, or a zero-area / malformed ring) yields what it can without
 * looping forever. Self-intersecting polygons are out of scope — overlay regions
 * and coverage outlines are simple rings.
 */
export function triangulatePolygon(points: Vec2[]): number[] {
  const n = points.length;
  if (n < 3) return [];

  // Working ring of original indices, forced CCW.
  const v: number[] =
    signedArea2(points) > 0
      ? Array.from({ length: n }, (_, i) => i)
      : Array.from({ length: n }, (_, i) => n - 1 - i);

  const result: number[] = [];
  let nv = n;
  let count = 2 * nv; // bails out if no ear is found in a full pass (bad polygon)
  let vi = nv - 1;

  while (nv > 2) {
    if (count-- <= 0) break;
    let u = vi;
    if (u >= nv) u = 0;
    vi = u + 1;
    if (vi >= nv) vi = 0;
    let w = vi + 1;
    if (w >= nv) w = 0;

    if (isEar(points, v, nv, u, vi, w)) {
      result.push(v[u], v[vi], v[w]);
      // Remove the ear tip v[vi] from the working ring.
      for (let s = vi, t = vi + 1; t < nv; s++, t++) v[s] = v[t];
      nv--;
      count = 2 * nv;
    }
  }
  return result;
}
