import type { OverlayScene } from "@/morph/overlay/scene";
import type { OverlayPalette } from "../overlay/resolveOverlayColors";
import type { ToolHud } from "./hud";
import type { ToolPointer } from "./pointer";
import type { ToolContext } from "./toolContext";

export type ToolId =
  | "select"
  | "point"
  | "line"
  | "polyline"
  | "region"
  | "brush"
  | "push"
  | "pan";

/**
 * A self-contained interaction module (PRD M11 lot 2). Each tool owns its draft /
 * drag state and mutates geometry through the stores referenced from
 * {@link ToolContext}, so undo/redo and keyframe tracks keep working. It also
 * emits transient overlay primitives (drafts, cursors) and contextual HUD data —
 * changing an interaction never touches the shaders, and vice versa.
 */
export interface Tool {
  readonly id: ToolId;

  onPointerDown(p: ToolPointer, ctx: ToolContext): void;
  onPointerMove(p: ToolPointer, ctx: ToolContext): void;
  onPointerUp(p: ToolPointer, ctx: ToolContext): void;
  /** Pointer moved with no button down — typically refreshes the hovered handle. */
  onPointerHover(p: ToolPointer, ctx: ToolContext): void;

  /** Enter — finalize a multi-click draft, if any. (Uses the stores directly.) */
  commit(): void;
  /** Escape / tool switch — drop any in-progress draft. (Uses the stores directly.) */
  cancel(): void;

  /** Extra overlay primitives for the live draft / cursor (null = nothing). */
  scene(
    p: ToolPointer | null,
    ctx: ToolContext,
    palette: OverlayPalette,
  ): OverlayScene | null;
  /** Contextual mini-HUD items (point count, hints, readouts). */
  hud(p: ToolPointer | null, ctx: ToolContext): ToolHud[];
  /** Tailwind cursor class for the current state. */
  cursor(ctx: ToolContext): string;
  /** True when the tool paints a cursor/draft that must redraw on pointer move. */
  wantsCursor(): boolean;
  /**
   * True while a multi-click draft is in progress. Drives the mobile commit/
   * cancel affordance (a keyboard-free stand-in for Enter/Escape). (PRD M12 lot 1)
   */
  hasDraft(): boolean;
}

/**
 * Complete no-op base (everything but `id`). A tool factory spreads this and
 * overrides only the handlers it needs, keeping each module focused.
 */
export const toolDefaults: Omit<Tool, "id"> = {
  onPointerDown() {},
  onPointerMove() {},
  onPointerUp() {},
  onPointerHover() {},
  commit() {},
  cancel() {},
  scene(): OverlayScene | null {
    return null;
  },
  hud(): ToolHud[] {
    return [];
  },
  cursor(): string {
    return "cursor-default";
  },
  wantsCursor(): boolean {
    return false;
  },
  hasDraft(): boolean {
    return false;
  },
};
