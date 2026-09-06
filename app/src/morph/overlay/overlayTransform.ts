import type { Rect } from "@/lib/viewport/projectSpace";

/**
 * Everything the overlay shaders need to place project-space geometry: the
 * project content box in CSS pixels (after zoom + pan, from the SAME
 * {@link import("@/lib/viewport/projectSpace").ProjectSpaceTransform} the panes
 * and hit-test use) and the canvas size in CSS pixels. Pixel sizes (handle
 * radius, line width) are converted to clip space with `2 / cssSize`, so they
 * stay constant on screen at any zoom and independent of devicePixelRatio (the
 * backing store just scales the same clip space).
 */
export type OverlayFrame = {
  content: Rect;
  cssWidth: number;
  cssHeight: number;
};

const FRAME_FLOATS = 8; // vec4 content + vec2 viewport + vec2 pad

/** Packs {@link OverlayFrame} into the `Frame` uniform layout used by overlay.wgsl. */
export function packFrameUniform(frame: OverlayFrame): Float32Array {
  const out = new Float32Array(FRAME_FLOATS);
  out[0] = frame.content.x;
  out[1] = frame.content.y;
  out[2] = frame.content.width;
  out[3] = frame.content.height;
  out[4] = frame.cssWidth;
  out[5] = frame.cssHeight;
  return out;
}

/** Project-space (0..1) → CSS pixels within the content box. */
export function projectToCss(
  frame: OverlayFrame,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: frame.content.x + x * frame.content.width,
    y: frame.content.y + y * frame.content.height,
  };
}

/**
 * Project-space (0..1) → WebGPU clip space [-1,1] (y up). CPU mirror of the
 * vertex transform in overlay.wgsl; kept here so it can be unit-tested without a
 * GPU and so the two stay in sync.
 */
export function projectToClip(
  frame: OverlayFrame,
  x: number,
  y: number,
): { x: number; y: number } {
  const css = projectToCss(frame, x, y);
  return {
    x: (css.x / frame.cssWidth) * 2 - 1,
    y: 1 - (css.y / frame.cssHeight) * 2,
  };
}

/** Clip-space delta for a screen-pixel size (magnitude per axis). */
export function pxToClip(frame: OverlayFrame): { x: number; y: number } {
  return { x: 2 / frame.cssWidth, y: 2 / frame.cssHeight };
}
