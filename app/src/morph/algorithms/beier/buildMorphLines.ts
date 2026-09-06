import type { BeierNeelySettings, FeaturePair, Vec2 } from "@/morph/model";

/**
 * A control line for Beier–Neely field morphing (PRD §10.5): a directed
 * segment on side A paired with its counterpart on side B. `weight` is a
 * per-line multiplier; `falloff` is reserved in v1 (kept for the GPU layout).
 */
export type MorphLine = {
  a0: Vec2;
  a1: Vec2;
  b0: Vec2;
  b1: Vec2;
  weight: number;
  falloff: number;
};

/** Reserved per-line falloff (unused in v1, see PRD §10.5 data layout). */
const DEFAULT_FALLOFF = 1;

/**
 * Converts enabled features into Beier–Neely control lines (PRD §10.5):
 * - each segment → one line;
 * - each polyline (when `samplePolylines`) → one line per consecutive vertex
 *   pair (an extra closing pair when `closed`), both sides paired by index;
 * - points and regions do not contribute.
 *
 * The result is capped at `settings.maxLines` (PRD §18.3). Pure — runs only
 * when features or settings change, not per frame.
 */
export function buildMorphLines(
  features: FeaturePair[],
  settings: BeierNeelySettings,
): MorphLine[] {
  const lines: MorphLine[] = [];

  for (const f of features) {
    if (!f.enabled) continue;
    const weight = f.weight ?? 1;

    if (f.kind === "segment") {
      lines.push({
        a0: f.a0,
        a1: f.a1,
        b0: f.b0,
        b1: f.b1,
        weight,
        falloff: f.falloff ?? DEFAULT_FALLOFF,
      });
    } else if (f.kind === "polyline" && settings.samplePolylines) {
      const n = Math.min(f.a.length, f.b.length);
      if (n < 2) continue;
      const falloff = f.falloff ?? DEFAULT_FALLOFF;
      const segments = f.closed ? n : n - 1;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % n;
        lines.push({
          a0: f.a[i],
          a1: f.a[j],
          b0: f.b[i],
          b1: f.b[j],
          weight,
          falloff,
        });
      }
    }
  }

  return lines.length > settings.maxLines
    ? lines.slice(0, settings.maxLines)
    : lines;
}
