import type { Vec2 } from "@/morph/model";
import { useEditorStore, type ViewportSlot } from "@/store/editorStore";
import type { ToolPointer } from "./pointer";
import type { ToolContext } from "./toolContext";
import { toolDefaults, type Tool } from "./tool";

const slotFor = (ctx: ToolContext): ViewportSlot =>
  ctx.side === "a" ? "source" : "target";

/** Drag-to-pan the pane's viewport (PRD M11 lot 2). Also runs when space is held. */
export function createPanTool(): Tool {
  let start: { screen: Vec2; pan: Vec2 } | null = null;

  return {
    ...toolDefaults,
    id: "pan",
    onPointerDown(p: ToolPointer, ctx: ToolContext) {
      start = {
        screen: p.screen,
        pan: { ...useEditorStore.getState().viewports[slotFor(ctx)].pan },
      };
    },
    onPointerMove(p: ToolPointer, ctx: ToolContext) {
      if (!start) return;
      // The pane rect is fixed during a drag, so screen deltas equal client deltas.
      useEditorStore.getState().setViewport(slotFor(ctx), {
        pan: {
          x: start.pan.x + (p.screen.x - start.screen.x),
          y: start.pan.y + (p.screen.y - start.screen.y),
        },
      });
    },
    onPointerUp() {
      start = null;
    },
    cursor() {
      return "cursor-grab";
    },
  };
}
