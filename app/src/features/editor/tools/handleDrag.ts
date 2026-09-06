import { featureHandles, type NormalizedVec2 } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { applyDragPatch, clampNorm, hitTestHandle } from "./toolHelpers";
import type { ToolPointer } from "./pointer";
import type { ToolContext } from "./toolContext";

export type DragState = {
  id: string;
  key: string;
  /** Mirror the move to both sides (used while creating a segment). */
  mirror: boolean;
  /** This drag is the initial create-drag of a new feature. */
  creating: boolean;
  /** Handle position on the dragged side at drag start (for snap-back). */
  startPos?: NormalizedVec2;
};

/**
 * Shared handle-drag mechanics (PRD M11 lot 2) reused by Select and the create
 * tools, preserving the old FeaturePane semantics: a hit starts a history
 * transaction + selection; moves write through `applyDragPatch` (keyframe tracks
 * for temporal media, mirrored for create); the owning tool decides how to
 * settle the transaction on `end`.
 */
export class HandleDrag {
  private drag: DragState | null = null;

  isActive(): boolean {
    return this.drag !== null;
  }

  state(): Readonly<DragState> | null {
    return this.drag;
  }

  /** Begins dragging an existing handle under the pointer. Returns true if one was hit. */
  startFromHit(p: ToolPointer, ctx: ToolContext): boolean {
    const hit = hitTestHandle(ctx, p.screen);
    if (!hit) return false;
    useEditorStore
      .getState()
      .selectFeature(hit.id, p.shiftKey ? "toggle" : "replace");
    useHistoryStore.getState().begin();
    const feature = ctx.features.find((f) => f.id === hit.id);
    const startPos = feature
      ? featureHandles(feature, ctx.side).find((h) => h.key === hit.key)?.pos
      : undefined;
    this.drag = {
      id: hit.id,
      key: hit.key,
      mirror: false,
      creating: false,
      startPos,
    };
    return true;
  }

  /** Begins the create-drag of a feature the tool has just added. */
  startCreating(id: string, key: string, mirror: boolean): void {
    this.drag = { id, key, mirror, creating: true };
  }

  move(p: ToolPointer, ctx: ToolContext): void {
    const drag = this.drag;
    if (!drag) return;
    const store = useProjectStore.getState();
    const raw = store.project?.features.find((f) => f.id === drag.id);
    if (!raw) return;
    const current = ctx.features.find((f) => f.id === drag.id) ?? raw;
    const patch = applyDragPatch(
      current,
      ctx.side,
      drag.key,
      clampNorm(p.norm),
      {
        mirror: drag.mirror,
        hasTemporalMedia: ctx.hasTemporalMedia,
        sideTimeSec: ctx.sideTimeSec,
      },
    );
    store.updateFeature(drag.id, patch);
  }

  /** Ends the gesture and returns the drag that ended (null when none was active). */
  end(): Readonly<DragState> | null {
    const drag = this.drag;
    if (!drag) return null;
    this.drag = null;
    return drag;
  }

  /** Drops any in-progress drag without committing. */
  reset(): void {
    this.drag = null;
  }
}
