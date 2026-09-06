import type { Vec2 } from "@/morph/model";
import { sampleCatmullRom } from "./catmullRom";

export const REGION_CONTOUR_STEPS = 16;

/**
 * Returns the contour rendered for a polyline or region. Closed contours include
 * a final copy of the first point so line renderers can consume one uniform
 * sequence without special-casing the closing edge.
 */
export function renderedContour(
  points: readonly Vec2[],
  smooth: boolean | undefined,
  closed: boolean,
): Vec2[] {
  if (smooth && points.length >= 3) {
    return sampleCatmullRom([...points], REGION_CONTOUR_STEPS, closed);
  }
  const contour = points.map((point) => ({ ...point }));
  if (closed && contour.length > 0) contour.push({ ...contour[0] });
  return contour;
}

/** Closed rendered contour without the duplicate final vertex, for fills. */
export function renderedRegionRing(
  points: readonly Vec2[],
  smooth: boolean | undefined,
): Vec2[] {
  const contour = renderedContour(points, smooth, true);
  return contour.length > 1 ? contour.slice(0, -1) : contour;
}
