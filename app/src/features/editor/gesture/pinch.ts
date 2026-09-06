import type { Vec2 } from "@/morph/model";
import { containRect } from "@/lib/viewport/projectSpace";

/** Viewport zoom bounds — mirror FeaturePane's wheel-zoom clamp (PRD M12 lot 1). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export type Viewport = { zoom: number; pan: Vec2 };

/** The two touch points of a pinch, in pane-local CSS px. */
export type TwoPointers = { a: Vec2; b: Vec2 };

/**
 * Frozen gesture reference captured at the moment the second finger lands. Holds
 * everything needed to keep the project-space point under the initial centroid
 * pinned while the fingers zoom (spread/pinch) and pan (translate together).
 */
export type PinchAnchor = {
  /** Contain box at zoom 1 (independent of zoom/pan). */
  baseW: number;
  baseH: number;
  paneW: number;
  paneH: number;
  startZoom: number;
  startDist: number;
  /** Normalized project-space coord under the start centroid. */
  n0: Vec2;
};

/**
 * Multiplicative zoom factor for one wheel event. Apple trackpads fire dozens
 * of small-delta wheel events per second (and a macOS trackpad pinch arrives
 * as wheel + ctrlKey), so the factor must scale with the delta — a fixed step
 * per event makes gentle trackpad gestures zoom uncontrollably fast.
 */
export function wheelZoomFactor(input: {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}): number {
  // Normalize LINE (Firefox mouse wheels) and PAGE deltas to pixels.
  const LINE_PX = 16;
  const px =
    input.deltaMode === 1
      ? input.deltaY * LINE_PX
      : input.deltaMode === 2
        ? input.deltaY * LINE_PX * 20
        : input.deltaY;
  // Pinch-wheel deltas are much smaller than scroll deltas.
  const sensitivity = input.ctrlKey ? 0.01 : 0.0022;
  // Cap a single event (wheel flings can report 500+ px) to at most ±65%.
  const exponent = Math.max(-0.5, Math.min(0.5, -px * sensitivity));
  return Math.exp(exponent);
}

function centroid(p: TwoPointers): Vec2 {
  return { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
}

function distance(p: TwoPointers): number {
  return Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y);
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Captures the pinch reference from the two initial touch points and the live
 * viewport. `projectAspect` is width/height of the project content box.
 */
export function beginPinch(
  pointers: TwoPointers,
  paneW: number,
  paneH: number,
  projectAspect: number,
  viewport: Viewport,
): PinchAnchor {
  const base = containRect(paneW, paneH, projectAspect);
  const c0 = centroid(pointers);
  const w0 = base.width * viewport.zoom;
  const h0 = base.height * viewport.zoom;
  const x0 = (paneW - w0) / 2 + viewport.pan.x;
  const y0 = (paneH - h0) / 2 + viewport.pan.y;
  return {
    baseW: base.width,
    baseH: base.height,
    paneW,
    paneH,
    startZoom: viewport.zoom,
    startDist: distance(pointers) || 1,
    n0: { x: (c0.x - x0) / (w0 || 1), y: (c0.y - y0) / (h0 || 1) },
  };
}

/**
 * Given the current finger positions, returns the viewport that (a) scales zoom
 * by the finger-distance ratio and (b) keeps the anchored project point under
 * the current centroid — so the image tracks the fingers for both spread and
 * two-finger drag.
 */
export function updatePinch(
  anchor: PinchAnchor,
  pointers: TwoPointers,
): Viewport {
  const c = centroid(pointers);
  const ratio = distance(pointers) / anchor.startDist;
  const zoom = clampZoom(anchor.startZoom * ratio);
  const w = anchor.baseW * zoom;
  const h = anchor.baseH * zoom;
  return {
    zoom,
    pan: {
      x: c.x - anchor.n0.x * w - (anchor.paneW - w) / 2,
      y: c.y - anchor.n0.y * h - (anchor.paneH - h) / 2,
    },
  };
}
