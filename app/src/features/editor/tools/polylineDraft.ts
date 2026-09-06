import type { FeaturePair, FeatureSide, Vec2 } from "@/morph/model";
import type { ProjectSpaceTransform } from "@/lib/viewport/projectSpace";
import { dist } from "./toolHelpers";

/**
 * What a click on an in-progress polygonal draft means (PRD M11 lot 2):
 * - `close-first` — clicked the first vertex ⇒ finish + mark the loop closed.
 * - `close-last`  — clicked the last vertex ⇒ finish (open).
 * - `append`      — anywhere else ⇒ add a new vertex.
 */
export type DraftClick = "close-first" | "close-last" | "append";

/**
 * Pure decision for the polyline/region draft state machine. `screenPts` are the
 * draft's vertices already projected to screen px, in order. Closing is only
 * offered once there are at least `minPoints` vertices.
 */
export function draftClickAction(
  screenPts: Vec2[],
  click: Vec2,
  minPoints: number,
  hitRadius: number,
): DraftClick {
  if (screenPts.length >= minPoints) {
    if (dist(screenPts[0], click) <= hitRadius) return "close-first";
    if (dist(screenPts[screenPts.length - 1], click) <= hitRadius) {
      return "close-last";
    }
  }
  return "append";
}

/** A resumable endpoint of an existing open polyline. */
export type ResumeTarget = { id: string; end: "first" | "last" };

/**
 * Finds an OPEN polyline whose first/last vertex sits under `screen`, so the
 * Polyline tool can continue drawing it (PRD M11 lot 2 — "reprise"). Closed
 * polylines, regions, locked/disabled features and mid-vertices are ignored
 * (those are draggable via Select instead).
 */
export function findResumablePolyline(
  features: FeaturePair[],
  side: FeatureSide,
  transform: ProjectSpaceTransform,
  screen: Vec2,
  hitRadius: number,
): ResumeTarget | null {
  for (const f of features) {
    if (f.kind !== "polyline" || f.closed) continue;
    if (!f.enabled || f.locked) continue;
    const pts = side === "a" ? f.a : f.b;
    if (pts.length < 2) continue;
    const last = transform.toScreen(pts[pts.length - 1]);
    if (dist(last, screen) <= hitRadius) return { id: f.id, end: "last" };
    const first = transform.toScreen(pts[0]);
    if (dist(first, screen) <= hitRadius) return { id: f.id, end: "first" };
  }
  return null;
}
