import type { Vec2 } from "@/morph/model";

/**
 * A contextual mini-HUD item emitted by a tool (PRD M11 lot 2): short text
 * anchored at a project-space point, rendered as crisp screen-space HTML by
 * {@link HudLayer}. Used for draft hints (point count, "click to close"), drag
 * readouts and the push radius.
 */
export type ToolHud = {
  /** Anchor in project space (0..1); HudLayer projects it to screen. */
  at: Vec2;
  text: string;
  /** Screen-px offset from the anchor. */
  dx?: number;
  dy?: number;
  tone?: "default" | "muted";
};
