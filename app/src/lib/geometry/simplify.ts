import type { Vec2 } from "@/morph/model";

/** Perpendicular distance from `p` to the infinite line through `a`→`b`. */
function perpendicularDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // |cross(b-a, p-a)| / |b-a| is the rejection (perpendicular) length.
  const cross = Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x));
  return cross / Math.sqrt(len2);
}

/**
 * Ramer–Douglas–Peucker polyline simplification (PRD M11 lot 2). Keeps both
 * endpoints and every vertex that deviates from the running chord by more than
 * `epsilon` (same units as the points). Feed a freehand stroke and a tolerance
 * scaled to the current zoom to collapse it to a handful of editable control
 * points. Iterative (an explicit stack) so very long strokes don't overflow.
 */
export function simplifyRdp(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length <= 2 || epsilon <= 0) return points.map((p) => ({ ...p }));

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon && idx !== -1) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }

  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push({ ...points[i] });
  }
  return out;
}

/**
 * True when a freehand stroke ends near where it began (last sample within
 * `tolerance` of the first), i.e. the user traced a closed loop. Needs at least
 * three samples so a single click/tap is never treated as a ring.
 */
export function isClosedStroke(points: Vec2[], tolerance: number): boolean {
  if (points.length < 3) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}
