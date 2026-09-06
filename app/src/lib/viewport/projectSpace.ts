import type { Vec2 } from "@/morph/model";

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Largest rect of the given aspect (width/height) centered inside an
 * `outerW × outerH` box (letterbox / "contain").
 */
export function containRect(
  outerW: number,
  outerH: number,
  aspect: number,
): Rect {
  let width: number;
  let height: number;
  if (outerW / outerH > aspect) {
    height = outerH;
    width = outerH * aspect;
  } else {
    width = outerW;
    height = outerW / aspect;
  }
  return { x: (outerW - width) / 2, y: (outerH - height) / 2, width, height };
}

/**
 * Maps Project Space [0,1]² to pane pixels and back (PRD §7.1). The project
 * occupies a fixed-aspect content box contained in the pane, scaled by the
 * viewport zoom (around the pane center) and shifted by the pan offset.
 */
export type ProjectSpaceTransform = {
  /** The project content box in pane pixels, after zoom + pan. */
  content: Rect;
  toScreen: (p: Vec2) => Vec2;
  toNormalized: (p: Vec2) => Vec2;
};

export function createProjectSpaceTransform(
  paneW: number,
  paneH: number,
  projectAspect: number,
  viewport: { zoom: number; pan: Vec2 },
): ProjectSpaceTransform {
  const base = containRect(paneW, paneH, projectAspect);
  const width = base.width * viewport.zoom;
  const height = base.height * viewport.zoom;
  const x = (paneW - width) / 2 + viewport.pan.x;
  const y = (paneH - height) / 2 + viewport.pan.y;
  return {
    content: { x, y, width, height },
    toScreen: (p) => ({ x: x + p.x * width, y: y + p.y * height }),
    toNormalized: (p) => ({ x: (p.x - x) / width, y: (p.y - y) / height }),
  };
}
