import type { Vec2 } from "@/morph/model";

/**
 * Stamp spacing along the stroke path, as a fraction of the brush diameter
 * (PRD M11 lot 3 — 0.1–0.25 × diameter keeps a fast stroke continuous).
 */
export const STAMP_SPACING_FACTOR = 0.15;

/**
 * Walk state threaded across pointer events so stamps stay uniformly spaced
 * over the whole stroke, not per-segment: `last` is the previous input point,
 * `carry` the path distance travelled since the last emitted stamp.
 */
export type StampPathState = {
  last: Vec2 | null;
  carry: number;
};

export const initialStampPath = (): StampPathState => ({
  last: null,
  carry: 0,
});

/**
 * Emits the stamp centers for the incoming path samples, spaced `spacing`
 * apart along the polyline (the very first point of a stroke always stamps).
 * Mutates nothing — returns the stamps plus the updated walk state.
 */
export function appendStamps(
  state: StampPathState,
  points: Vec2[],
  spacing: number,
): { stamps: Vec2[]; state: StampPathState } {
  const step = Math.max(spacing, 1e-6);
  const stamps: Vec2[] = [];
  let last = state.last;
  let carry = state.carry;

  for (const p of points) {
    if (!last) {
      stamps.push(p);
      last = p;
      carry = 0;
      continue;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;

    let d = step - carry;
    let emitted = false;
    while (d <= length) {
      const t = d / length;
      stamps.push({ x: last.x + dx * t, y: last.y + dy * t });
      emitted = true;
      d += step;
    }
    carry = emitted ? length - (d - step) : carry + length;
    last = p;
  }

  return { stamps, state: { last, carry } };
}

/**
 * CPU mirror of the brush falloff in `brush.wgsl`, for tests and readouts:
 * fully `strength` inside `radius × hardness`, smoothstep to 0 at `radius`.
 */
export function stampAlpha(
  dist: number,
  radius: number,
  hardness: number,
  strength: number,
): number {
  const inner = radius * Math.min(Math.max(hardness, 0), 1);
  const outer = Math.max(radius, inner + 1e-3);
  const t = Math.min(Math.max((dist - inner) / (outer - inner), 0), 1);
  return (1 - t * t * (3 - 2 * t)) * strength;
}
