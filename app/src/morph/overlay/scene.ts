import type { Vec2 } from "@/morph/model";

/**
 * Straight (non-premultiplied) RGBA in 0..1. The renderer premultiplies before
 * blending so callers think in plain colours + alpha.
 */
export type Rgba = readonly [number, number, number, number];

/**
 * A filled polygon (region tint, etc). `points` is a simple ring in project
 * space (0..1); it is triangulated by the renderer. `color` carries its own
 * alpha (e.g. 0.1 region fill).
 */
export type FillPrim = {
  points: Vec2[];
  color: Rgba;
};

/**
 * A straight segment between two project-space points, `widthPx` thick in screen
 * pixels (constant at any zoom). Butt caps, matching the SVG defaults.
 */
export type LinePrim = {
  a: Vec2;
  b: Vec2;
  color: Rgba;
  widthPx: number;
};

/**
 * A handle/vertex dot at a project-space point. `radiusPx` is the fill radius in
 * screen pixels; `strokeWidthPx` draws a ring centred on that radius.
 */
export type DotPrim = {
  pos: Vec2;
  radiusPx: number;
  fill: Rgba;
  stroke: Rgba;
  strokeWidthPx: number;
};

/**
 * The whole interaction overlay for one viewport, as plain data — agnostic of
 * features/grids/brush (PRD M11). Draw order is fills → lines → dots, so dots sit
 * on top of connectors which sit on top of region tints, matching the old SVG
 * stacking. A polyline/grid line is emitted as a run of {@link LinePrim}s.
 */
export type OverlayScene = {
  fills: FillPrim[];
  lines: LinePrim[];
  dots: DotPrim[];
};

export const emptyScene = (): OverlayScene => ({
  fills: [],
  lines: [],
  dots: [],
});
