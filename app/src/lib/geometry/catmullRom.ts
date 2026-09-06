import type { Vec2 } from "@/morph/model";

/** Uniform Catmull-Rom interpolation at `u` ∈ [0,1] on the span p1→p2. */
function segmentPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const u2 = u * u;
  const u3 = u2 * u;
  const coord = (a: number, b: number, c: number, d: number): number =>
    0.5 *
    (2 * b +
      (-a + c) * u +
      (2 * a - 5 * b + 4 * c - d) * u2 +
      (-a + 3 * b - 3 * c + d) * u3);
  return {
    x: coord(p0.x, p1.x, p2.x, p3.x),
    y: coord(p0.y, p1.y, p2.y, p3.y),
  };
}

/**
 * Samples a Catmull-Rom curve that passes THROUGH `points` (interpolating, no
 * tangent handles) into a dense polyline (PRD M11 lot 2). `segmentSteps` is the
 * subdivision per span; endpoints are duplicated for the phantom tangents when
 * open, or wrapped when `closed`. This is both the display smoothing and the
 * "resample the curve into plain points" the morph consumes. Fewer than three
 * control points have no curvature, so they pass through unchanged.
 */
export function sampleCatmullRom(
  points: Vec2[],
  segmentSteps = 16,
  closed = false,
): Vec2[] {
  const n = points.length;
  if (n < 3 || segmentSteps < 1) return points.map((p) => ({ ...p }));

  const at = (i: number): Vec2 =>
    closed
      ? points[((i % n) + n) % n]
      : points[Math.min(n - 1, Math.max(0, i))];

  const spans = closed ? n : n - 1;
  const out: Vec2[] = [];
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // u=0 reproduces p1 exactly, so every control point lands in the output.
    for (let s = 0; s < segmentSteps; s++) {
      out.push(segmentPoint(p0, p1, p2, p3, s / segmentSteps));
    }
  }
  // Close the ring / land the final endpoint that the u<1 loop stops short of.
  out.push(closed ? { ...out[0] } : { ...points[n - 1] });
  return out;
}
