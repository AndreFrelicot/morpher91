import i18next from "i18next";
import { GLOBAL_LAYER_ID, type Vec2 } from "@/morph/model";
import type { Rgba } from "@/morph/overlay/scene";
import {
  beginBrushStroke,
  cancelBrushStroke,
  commitBrushStroke,
  ensureBrushEngine,
  extendBrushStroke,
  syncBrushBase,
} from "@/morph/paint/brushPaintHost";
import { useEditorStore } from "@/store/editorStore";
import { clampNorm, emptyScene } from "./toolHelpers";
import type { ToolPointer } from "./pointer";
import { toolDefaults, type Tool } from "./tool";
import type { ToolContext } from "./toolContext";

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

/** Screen-px ring radius for the current brush diameter (project-space size). */
function ringRadiusPx(ctx: ToolContext): number {
  const { content } = ctx.transform;
  const diameter = useEditorStore.getState().brush.diameter;
  return Math.max(2, (diameter * Math.min(content.width, content.height)) / 2);
}

/** True when painting is allowed here: an editable, non-global active layer. */
function paintable(ctx: ToolContext): boolean {
  return ctx.activeLayerEditable && ctx.activeLayerId !== GLOBAL_LAYER_ID;
}

/**
 * Mask brush (PRD M11 lot 3): paints the active layer's alpha mask on the GPU
 * {@link BrushEngine} — spaced stamps into a max-blend stroke buffer, composed
 * onto the mask once on pointer-up, then committed to the layer document. The
 * eraser is the same stroke with a subtract compose. The cursor ring is an SDF
 * dot from the shared overlay renderer; strokes are NOT undo steps (history
 * tracks features only) — erase or clear the mask to correct.
 */
export function createBrushTool(): Tool {
  let painting = false;

  const strokePoints = (p: ToolPointer): Vec2[] =>
    p.coalesced.map((s) => clampNorm(s.norm));

  return {
    ...toolDefaults,
    id: "brush",
    onPointerDown(p: ToolPointer, ctx: ToolContext) {
      if (!paintable(ctx)) return;
      // Alt/Option-drag paints with the eraser without touching the checkbox.
      painting = beginBrushStroke(p.altKey ? { erase: true } : undefined);
      if (painting) extendBrushStroke(strokePoints(p));
    },
    onPointerMove(p: ToolPointer) {
      if (painting) extendBrushStroke(strokePoints(p));
    },
    onPointerUp(p: ToolPointer) {
      if (!painting) return;
      painting = false;
      extendBrushStroke(strokePoints(p));
      void commitBrushStroke();
    },
    onPointerHover(_p: ToolPointer, ctx: ToolContext) {
      // Keep the engine warm + in sync so the first stroke never drops.
      if (paintable(ctx)) {
        void ensureBrushEngine().then(() => syncBrushBase());
      }
    },
    cancel() {
      if (!painting) return;
      painting = false;
      cancelBrushStroke();
    },
    scene(p, ctx, palette): ReturnType<Tool["scene"]> {
      if (!p) return null;
      const erase = useEditorStore.getState().brush.erase || p.altKey;
      const color = erase ? palette.accentB : palette.foreground;
      const out = emptyScene();
      out.dots.push({
        pos: clampNorm(p.norm),
        radiusPx: ringRadiusPx(ctx),
        fill: withAlpha(color, 0),
        stroke: withAlpha(color, 0.8),
        strokeWidthPx: 1.25,
      });
      return out;
    },
    hud(p, ctx) {
      if (!p) return [];
      if (ctx.activeLayerId === GLOBAL_LAYER_ID) {
        return [
          {
            at: clampNorm(p.norm),
            text: i18next.t("hud.maskBrushSelectLayer"),
            dy: -(ringRadiusPx(ctx) + 14),
            tone: "muted",
          },
        ];
      }
      if (!useEditorStore.getState().brush.erase && !p.altKey) return [];
      return [
        {
          at: clampNorm(p.norm),
          text: i18next.t("hud.eraser"),
          dy: -(ringRadiusPx(ctx) + 14),
          tone: "muted",
        },
      ];
    },
    cursor(ctx) {
      return paintable(ctx) ? "cursor-crosshair" : "cursor-not-allowed";
    },
    wantsCursor() {
      return true;
    },
  };
}
