import i18next from "i18next";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import type { Rgba } from "@/morph/overlay/scene";
import { HandleDrag } from "./handleDrag";
import {
  closePolylineOnDrop,
  closeTargetForDrag,
  type CloseTarget,
} from "./closePolyline";
import { emptyScene, hitTestHandle } from "./toolHelpers";
import type { ToolHud } from "./hud";
import type { ToolPointer } from "./pointer";
import { toolDefaults, type Tool } from "./tool";
import type { ToolContext } from "./toolContext";

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

/**
 * Select / move tool (PRD M11 lot 2): click a handle to select + drag it, click
 * empty space to clear the selection. Shift toggles multi-select. Dragging goes
 * through {@link HandleDrag} so keyframe tracks and undo behave as before.
 * Dropping an endpoint of an open polyline onto its opposite endpoint closes
 * the contour (see {@link closePolylineOnDrop}).
 */
export function createSelectTool(): Tool {
  const drag = new HandleDrag();
  let closeTarget: CloseTarget | null = null;

  return {
    ...toolDefaults,
    id: "select",
    onPointerDown(p: ToolPointer, ctx: ToolContext) {
      if (drag.startFromHit(p, ctx)) return;
      if (!p.shiftKey) useEditorStore.getState().clearSelection();
    },
    onPointerMove(p: ToolPointer, ctx: ToolContext) {
      drag.move(p, ctx);
      closeTarget = closeTargetForDrag(drag.state(), p, ctx);
    },
    onPointerUp(p: ToolPointer, ctx: ToolContext) {
      closeTarget = null;
      const ended = drag.end();
      if (!ended) return;
      if (closeTargetForDrag(ended, p, ctx)) closePolylineOnDrop(ended, ctx);
      useHistoryStore.getState().commit();
    },
    onPointerHover(p: ToolPointer, ctx: ToolContext) {
      const hit = hitTestHandle(ctx, p.screen);
      ctx.setHovered(hit?.id ?? null, hit?.key ?? null);
    },
    cancel() {
      closeTarget = null;
      drag.reset();
    },
    scene(p, ctx, palette): ReturnType<Tool["scene"]> {
      const target = closeTargetForDrag(drag.state(), p, ctx);
      if (!target) return null;
      // Snap affordance: ring the opposite endpoint while a drop would close.
      const out = emptyScene();
      out.dots.push({
        pos: target.targetPos,
        radiusPx: 10,
        fill: withAlpha(palette.selectedStroke, 0.12),
        stroke: palette.selectedStroke,
        strokeWidthPx: 2,
      });
      return out;
    },
    hud(p, ctx): ToolHud[] {
      const target = closeTargetForDrag(drag.state(), p, ctx);
      if (!target) return [];
      return [
        {
          at: target.targetPos,
          text: i18next.t("hud.releaseToClose"),
          dy: -22,
          tone: "default",
        },
      ];
    },
    cursor(ctx: ToolContext) {
      return ctx.hoveredId ? "cursor-pointer" : "cursor-default";
    },
    wantsCursor() {
      return closeTarget !== null;
    },
  };
}
