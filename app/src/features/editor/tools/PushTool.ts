import {
  featureHandles,
  type FeaturePair,
  type FeaturePatch,
  type Vec2,
} from "@/morph/model";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import type { Rgba } from "@/morph/overlay/scene";
import { pushPoints } from "./pushPoints";
import {
  applyDragPatch,
  clampNorm,
  emptyScene,
  layerLocked,
} from "./toolHelpers";
import type { ToolPointer } from "./pointer";
import { toolDefaults, type Tool } from "./tool";
import type { ToolContext } from "./toolContext";

/** Push-brush radius in screen px (zoom-stable: distance is measured on screen). */
const PUSH_RADIUS_PX = 60;

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

/**
 * Builds one composed patch nudging a feature's handles by the brush falloff.
 * Handle positions are read from the SAMPLED feature (what's on screen) and the
 * patch is built off the RAW store feature via {@link applyDragPatch}, so the
 * write goes through the same path as a drag — keyframe tracks in temporal media,
 * direct positions for stills. Returns null when nothing moved (no store churn).
 */
function pushFeature(
  sampled: FeaturePair,
  raw: FeaturePair,
  ctx: ToolContext,
  center: Vec2,
  delta: Vec2,
): FeaturePatch | null {
  const handles = featureHandles(sampled, ctx.side);
  const screen = handles.map((h) => ctx.transform.toScreen(h.pos));
  const moved = pushPoints(screen, center, delta, PUSH_RADIUS_PX);

  let patch: FeaturePatch = {};
  let working = raw;
  let changed = false;
  handles.forEach((h, i) => {
    if (moved[i].x === screen[i].x && moved[i].y === screen[i].y) return;
    const norm = clampNorm(ctx.transform.toNormalized(moved[i]));
    const p = applyDragPatch(working, ctx.side, h.key, norm, {
      mirror: false,
      hasTemporalMedia: ctx.hasTemporalMedia,
      sideTimeSec: ctx.sideTimeSec,
    });
    patch = { ...patch, ...p } as FeaturePatch;
    working = { ...working, ...p } as FeaturePair;
    changed = true;
  });
  return changed ? patch : null;
}

/**
 * Push-points sculpt tool (PRD M11 lot 2): drag to nudge nearby control points
 * with a radial falloff — handy for organically adjusting a contour (e.g. a
 * keyframe propagated from the previous frame). Scoped to the active layer's
 * on-screen features (same source of truth as hit-test/display). One drag = one
 * undo step.
 */
export function createPushTool(): Tool {
  let last: Vec2 | null = null;

  const editable = (f: FeaturePair): boolean =>
    f.enabled && !f.locked && !layerLocked(f.layerId);

  return {
    ...toolDefaults,
    id: "push",
    onPointerDown(p: ToolPointer) {
      last = p.screen;
      useHistoryStore.getState().begin();
    },
    onPointerMove(p: ToolPointer, ctx: ToolContext) {
      if (!last) return;
      const delta = { x: p.screen.x - last.x, y: p.screen.y - last.y };
      last = p.screen;
      if (delta.x === 0 && delta.y === 0) return;
      const store = useProjectStore.getState();
      // Only the active layer's on-screen features — what the pane shows and
      // hit-tests — so the brush nudges exactly the points you see.
      for (const sampled of ctx.features) {
        if (!editable(sampled)) continue;
        const raw = store.project?.features.find((f) => f.id === sampled.id);
        if (!raw) continue;
        const patch = pushFeature(sampled, raw, ctx, p.screen, delta);
        if (patch) store.updateFeature(sampled.id, patch);
      }
    },
    onPointerUp() {
      if (!last) return;
      last = null;
      useHistoryStore.getState().commit();
    },
    scene(p, _ctx, palette): ReturnType<Tool["scene"]> {
      if (!p) return null;
      const out = emptyScene();
      // Unclamped: the brush may sit outside the media so edge points can be
      // pushed inwards from beyond the border (the points themselves stay
      // clamped in pushFeature).
      out.dots.push({
        pos: p.norm,
        radiusPx: PUSH_RADIUS_PX,
        fill: withAlpha(palette.foreground, 0),
        stroke: withAlpha(palette.foreground, 0.7),
        strokeWidthPx: 1.25,
      });
      return out;
    },
    cursor() {
      return "cursor-crosshair";
    },
    wantsCursor() {
      return true;
    },
  };
}
