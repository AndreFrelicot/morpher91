import type { NormalizedVec2 } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { applyDragPatch, dist } from "./toolHelpers";
import type { DragState } from "./handleDrag";
import type { ToolPointer } from "./pointer";
import type { ToolContext } from "./toolContext";

/** Screen-px radius around the opposite endpoint that arms the close-drop. */
export const CLOSE_SNAP_PX = 14;

export type CloseTarget = {
  featureId: string;
  /** Endpoint being dragged ("0" or the last index). */
  draggedKey: string;
  /** The opposite endpoint the drop would join. */
  targetKey: string;
  targetPos: NormalizedVec2;
};

/**
 * While dragging an endpoint of an OPEN polyline, returns the opposite endpoint
 * when the pointer is close enough that releasing would close the contour
 * (PRD-adjacent UX: Illustrator-style path closing). Null otherwise.
 */
export function closeTargetForDrag(
  drag: Readonly<DragState> | null,
  p: ToolPointer | null,
  ctx: ToolContext,
): CloseTarget | null {
  if (!drag || !p || drag.creating) return null;
  const f = ctx.features.find((x) => x.id === drag.id);
  if (!f || f.kind !== "polyline" || f.closed === true) return null;
  const pts = ctx.side === "a" ? f.a : f.b;
  const n = pts.length;
  if (n < 3) return null;
  const i = Number(drag.key);
  if (i !== 0 && i !== n - 1) return null;
  const targetIndex = i === 0 ? n - 1 : 0;
  const targetPos = pts[targetIndex];
  if (dist(ctx.transform.toScreen(targetPos), p.screen) > CLOSE_SNAP_PX) {
    return null;
  }
  return {
    featureId: f.id,
    draggedKey: drag.key,
    targetKey: String(targetIndex),
    targetPos,
  };
}

/**
 * Closes the polyline after an endpoint was dropped on its opposite endpoint:
 * the dragged endpoint snaps back to where it was (the closing edge joins the
 * original endpoints — no duplicate vertex) and a beacon burst plays on both
 * endpoints, in both panes, so the join reads clearly.
 */
export function closePolylineOnDrop(
  drag: Readonly<DragState>,
  ctx: ToolContext,
): void {
  const store = useProjectStore.getState();
  const raw = store.project?.features.find((f) => f.id === drag.id);
  if (!raw || raw.kind !== "polyline") return;
  const current = ctx.features.find((f) => f.id === drag.id) ?? raw;
  const restore = drag.startPos
    ? applyDragPatch(current, ctx.side, drag.key, drag.startPos, {
        mirror: false,
        hasTemporalMedia: ctx.hasTemporalMedia,
        sideTimeSec: ctx.sideTimeSec,
      })
    : {};
  store.updateFeature(drag.id, { ...restore, closed: true });
  useEditorStore
    .getState()
    .triggerBeaconBurst(drag.id, ["0", String(raw.a.length - 1)]);
}
