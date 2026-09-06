import { createSegmentFeature } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { HandleDrag } from "./handleDrag";
import {
  applyActiveLayer,
  clampNorm,
  dist,
  hitTestHandle,
} from "./toolHelpers";
import type { ToolPointer } from "./pointer";
import { toolDefaults, type Tool } from "./tool";
import type { ToolContext } from "./toolContext";

/** Min (normalized) length below which a freshly drawn segment is dropped. */
const MIN_SEGMENT_LEN = 0.01;

/**
 * Line/segment tool (PRD M11 lot 2): click-drag from one endpoint to the other
 * (mirrored to both sides while creating), or grab an existing handle. A segment
 * shorter than {@link MIN_SEGMENT_LEN} on release is discarded.
 */
export function createLineTool(): Tool {
  const drag = new HandleDrag();

  const dropCreating = (id: string) => {
    useProjectStore.getState().removeFeature(id);
    useHistoryStore.getState().cancel();
  };

  return {
    ...toolDefaults,
    id: "line",
    onPointerDown(p: ToolPointer, ctx: ToolContext) {
      if (drag.startFromHit(p, ctx)) return;
      if (!ctx.activeLayerEditable) return;
      const n = clampNorm(p.norm);
      const f = applyActiveLayer(createSegmentFeature(n, n), ctx.activeLayerId);
      useHistoryStore.getState().begin();
      useProjectStore.getState().addFeature(f);
      useEditorStore.getState().selectFeature(f.id, "replace");
      drag.startCreating(f.id, "1", true);
    },
    onPointerMove(p: ToolPointer, ctx: ToolContext) {
      drag.move(p, ctx);
    },
    onPointerUp() {
      const ended = drag.end();
      if (!ended) return;
      const f = useProjectStore
        .getState()
        .project?.features.find((x) => x.id === ended.id);
      const tooShort =
        ended.creating &&
        f?.kind === "segment" &&
        dist(f.a0, f.a1) < MIN_SEGMENT_LEN;
      if (tooShort) dropCreating(ended.id);
      else useHistoryStore.getState().commit();
    },
    onPointerHover(p: ToolPointer, ctx: ToolContext) {
      const hit = hitTestHandle(ctx, p.screen);
      ctx.setHovered(hit?.id ?? null, hit?.key ?? null);
    },
    cancel() {
      const state = drag.state();
      if (state?.creating) dropCreating(state.id);
      drag.reset();
    },
    cursor(ctx: ToolContext) {
      return ctx.hoveredId ? "cursor-pointer" : "cursor-crosshair";
    },
  };
}
