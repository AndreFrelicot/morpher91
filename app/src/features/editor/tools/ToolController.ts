import type { OverlayScene } from "@/morph/overlay/scene";
import type { OverlayPalette } from "../overlay/resolveOverlayColors";
import type { ToolHud } from "./hud";
import type { ToolPointer } from "./pointer";
import type { Tool, ToolId } from "./tool";
import type { ToolContext } from "./toolContext";
import { createToolRegistry } from "./registry";

/**
 * Per-pane interaction orchestrator (PRD M11 lot 2). Routes the normalized
 * pointer/keyboard stream to the active {@link Tool}, while space-held gestures
 * always pan. It holds no geometry and no context of its own — the component
 * passes a fresh {@link ToolContext} on every call, so the controller stays a
 * pure dispatcher (only the active tool, the in-flight gesture and the last
 * pointer are remembered between events).
 */
export class ToolController {
  private readonly tools: Record<ToolId, Tool>;
  private activeId: ToolId = "select";
  /** The tool handling the in-progress button gesture (down→up). */
  private gestureTool: Tool | null = null;
  /** Last pointer seen, for cursor/draft rendering between events. */
  private lastPointer: ToolPointer | null = null;

  constructor(registry: Record<ToolId, Tool> = createToolRegistry()) {
    this.tools = registry;
  }

  /** Switches the active tool, cancelling any draft on the outgoing one. */
  setActiveTool(id: ToolId): void {
    if (id === this.activeId) return;
    this.active.cancel();
    this.gestureTool = null;
    this.activeId = id;
  }

  private get active(): Tool {
    return this.tools[this.activeId];
  }

  /** Pan tool runs when space is held, regardless of the selected tool. */
  private toolForGesture(ctx: ToolContext): Tool {
    return ctx.spaceHeld ? this.tools.pan : this.active;
  }

  pointerDown(p: ToolPointer, ctx: ToolContext): void {
    this.lastPointer = p;
    this.gestureTool = this.toolForGesture(ctx);
    this.gestureTool.onPointerDown(p, ctx);
  }

  pointerMove(p: ToolPointer, ctx: ToolContext): void {
    this.lastPointer = p;
    if (this.gestureTool) this.gestureTool.onPointerMove(p, ctx);
    else this.active.onPointerHover(p, ctx);
  }

  pointerUp(p: ToolPointer, ctx: ToolContext): void {
    this.lastPointer = p;
    const tool = this.gestureTool ?? this.active;
    tool.onPointerUp(p, ctx);
    this.gestureTool = null;
  }

  /** Pointer left the pane: end any gesture and clear cursor state. */
  pointerLeave(ctx: ToolContext): void {
    this.lastPointer = null;
    ctx.setHovered(null);
  }

  commit(): void {
    this.active.commit();
  }

  cancel(): void {
    this.active.cancel();
  }

  /** Transient overlay primitives (draft / cursor) of the active tool. */
  scene(palette: OverlayPalette, ctx: ToolContext): OverlayScene | null {
    return this.active.scene(this.lastPointer, ctx, palette);
  }

  hud(ctx: ToolContext): ToolHud[] {
    return this.active.hud(this.lastPointer, ctx);
  }

  cursor(ctx: ToolContext): string {
    if (ctx.spaceHeld) return "cursor-grab";
    return this.active.cursor(ctx);
  }

  /** True when a pointer move should trigger an overlay redraw (live cursor/draft). */
  wantsCursor(): boolean {
    return Boolean(this.gestureTool) || this.active.wantsCursor();
  }

  /** True while the active tool has a multi-click draft (mobile commit/cancel UI). */
  hasDraft(): boolean {
    return this.active.hasDraft();
  }
}
