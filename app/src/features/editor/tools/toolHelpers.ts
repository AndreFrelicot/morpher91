import {
  applyHandle,
  applyHandleMirrored,
  featureHandles,
  GLOBAL_LAYER_ID,
  patchFeatureHandleTrack,
  type FeaturePair,
  type FeaturePatch,
  type FeatureSide,
  type LayerId,
  type NormalizedVec2,
  type Vec2,
  featureKeyframeTimes,
} from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { emptyScene, type OverlayScene } from "@/morph/overlay/scene";
import type { ToolContext } from "./toolContext";

/** Hit radius for handles, in screen px (parity with the old FeaturePane). */
export const HANDLE_HIT_RADIUS = 10;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
export const dist = (a: Vec2, b: Vec2): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Clamps a normalized point into the [0,1]² project box. */
export const clampNorm = (p: Vec2): NormalizedVec2 => ({
  x: clamp01(p.x),
  y: clamp01(p.y),
});

/** True when the feature's layer is locked (geometry there is read-only). */
export function layerLocked(layerId: LayerId | undefined): boolean {
  const project = useProjectStore.getState().project;
  return (
    project?.layers.find((l) => l.id === (layerId ?? GLOBAL_LAYER_ID))
      ?.locked ?? false
  );
}

/** Stamps the active layer onto a freshly created feature (global ⇒ no layerId). */
export function applyActiveLayer<T extends FeaturePair>(
  f: T,
  activeLayerId: LayerId,
): T {
  return activeLayerId === GLOBAL_LAYER_ID
    ? f
    : { ...f, layerId: activeLayerId };
}

export type HandleHit = { id: string; key: string };

/** Nearest selectable handle under `screen` within the hit radius, else null. */
export function hitTestHandle(
  ctx: ToolContext,
  screen: Vec2,
): HandleHit | null {
  if (!ctx.showFeatures) return null;
  let best: { id: string; key: string; d: number } | null = null;
  for (const f of ctx.features) {
    if (!f.enabled || f.locked || layerLocked(f.layerId)) continue;
    for (const h of featureHandles(f, ctx.side)) {
      const s = ctx.transform.toScreen(h.pos);
      const d = dist(s, screen);
      if (d <= HANDLE_HIT_RADIUS && (!best || d < best.d)) {
        best = { id: f.id, key: h.key, d };
      }
    }
  }
  return best ? { id: best.id, key: best.key } : null;
}

/**
 * Patch for moving one handle: mirrored writes both sides (no track);
 * otherwise the move writes a keyframe at `sideTimeSec` when the side is
 * animated, else the base position directly. A side is animated on temporal
 * media (video: every move keys, so features track the motion) or, on still
 * images, once a first keyframe was posed explicitly (◆ in the inspector) —
 * so adjusting a still correspondence never keys by accident (M25 follow-up).
 */
export function applyDragPatch(
  feature: FeaturePair,
  side: FeatureSide,
  key: string,
  norm: NormalizedVec2,
  opts: { mirror: boolean; hasTemporalMedia: boolean; sideTimeSec: number },
): FeaturePatch {
  if (opts.mirror) return applyHandleMirrored(feature, key, norm);
  const animated =
    opts.hasTemporalMedia || featureKeyframeTimes(feature, side).length > 0;
  if (!animated) return applyHandle(feature, side, key, norm);
  return patchFeatureHandleTrack(
    feature,
    side,
    key,
    norm,
    opts.sideTimeSec,
    {},
  );
}

/** Concatenates two overlay scenes (draw order preserved). */
export function mergeScenes(
  into: OverlayScene,
  extra: OverlayScene | null,
): OverlayScene {
  if (!extra) return into;
  return {
    fills: [...into.fills, ...extra.fills],
    lines: [...into.lines, ...extra.lines],
    dots: [...into.dots, ...extra.dots],
  };
}

export { emptyScene };
