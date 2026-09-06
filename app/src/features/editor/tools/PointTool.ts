import { createPointFeature } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { HandleDrag } from "./handleDrag";
import { applyActiveLayer, clampNorm, hitTestHandle } from "./toolHelpers";
import type { ToolPointer } from "./pointer";
import { toolDefaults, type Tool } from "./tool";
import type { ToolContext } from "./toolContext";

/** Point tool (PRD M11 lot 2): click to drop a point, or grab an existing handle. */
export function createPointTool(): Tool {
  const drag = new HandleDrag();

  return {
    ...toolDefaults,
    id: "point",
    onPointerDown(p: ToolPointer, ctx: ToolContext) {
      if (drag.startFromHit(p, ctx)) return;
      if (!ctx.activeLayerEditable) return;
      const history = useHistoryStore.getState();
      const f = applyActiveLayer(
        createPointFeature(clampNorm(p.norm)),
        ctx.activeLayerId,
      );
      history.begin();
      useProjectStore.getState().addFeature(f);
      history.commit();
      useEditorStore.getState().selectFeature(f.id, "replace");
    },
    onPointerMove(p: ToolPointer, ctx: ToolContext) {
      drag.move(p, ctx);
    },
    onPointerUp() {
      if (drag.end()) useHistoryStore.getState().commit();
    },
    onPointerHover(p: ToolPointer, ctx: ToolContext) {
      const hit = hitTestHandle(ctx, p.screen);
      ctx.setHovered(hit?.id ?? null, hit?.key ?? null);
    },
    cancel() {
      drag.reset();
    },
    cursor(ctx: ToolContext) {
      return ctx.hoveredId ? "cursor-pointer" : "cursor-crosshair";
    },
  };
}
