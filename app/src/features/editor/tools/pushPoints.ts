import type { Vec2 } from "@/morph/model";

/**
 * Radial falloff weight, 1 at the centre easing smoothly to 0 at `radius`
 * (smoothstep on the inverted, normalized distance). Used by the push-points
 * sculpt so the drag tapers off near the brush edge.
 */
export function falloffWeight(dist: number, radius: number): number {
  if (radius <= 0) return dist <= 0 ? 1 : 0;
  const x = 1 - Math.min(1, Math.max(0, dist / radius));
  return x * x * (3 - 2 * x);
}

/**
 * Push-points sculpt (PRD M11 lot 2): translate every point by `delta` scaled by
 * a radial falloff around `center`. Operate in one consistent space (the pane's
 * screen px, so the radius is zoom-stable). Pure — returns fresh points and
 * leaves the input untouched; points at/beyond `radius` are copied unchanged.
 */
export function pushPoints(
  points: Vec2[],
  center: Vec2,
  delta: Vec2,
  radius: number,
): Vec2[] {
  return points.map((p) => {
    const w = falloffWeight(Math.hypot(p.x - center.x, p.y - center.y), radius);
    return w === 0 ? { ...p } : { x: p.x + delta.x * w, y: p.y + delta.y * w };
  });
}
