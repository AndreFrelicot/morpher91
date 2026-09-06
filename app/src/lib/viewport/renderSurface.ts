import { matchesConstrainedGpuProfile } from "@/lib/gpu/constrainedProfile";
import { shouldWarnFeatureCount } from "@/lib/messages";

export type BackingSize = { width: number; height: number };

export const MAX_VIEWPORT_DPR = 2;
export const MAX_VIEWPORT_EDGE = 1536;
export const MAX_CONSTRAINED_VIEWPORT_EDGE = 1024;

/**
 * Computes a canvas backing-store size from a CSS rectangle without changing
 * its aspect ratio, even when a max GPU texture edge forces downscaling.
 */
export function fitBackingSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxEdge: number,
): BackingSize {
  const rawWidth = Math.max(1, cssWidth * dpr);
  const rawHeight = Math.max(1, cssHeight * dpr);
  const scale = Math.min(1, maxEdge / rawWidth, maxEdge / rawHeight);

  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
  };
}

export type ViewportBackingOptions = {
  devicePixelRatio: number;
  constrained: boolean;
  highFeatureCount: boolean;
};

/** Shared backing-store budget for every full-viewport WebGPU surface. */
export function fitViewportBackingSize(
  cssWidth: number,
  cssHeight: number,
  { devicePixelRatio, constrained, highFeatureCount }: ViewportBackingOptions,
): BackingSize {
  const dpr = Math.min(devicePixelRatio || 1, MAX_VIEWPORT_DPR);
  const baseEdge = constrained
    ? MAX_CONSTRAINED_VIEWPORT_EDGE
    : MAX_VIEWPORT_EDGE;
  const maxEdge = highFeatureCount ? Math.floor(baseEdge / 2) : baseEdge;
  return fitBackingSize(cssWidth, cssHeight, dpr, maxEdge);
}

/** Uses current device capabilities for imperative canvas sizing. */
export function currentViewportBackingSize(
  cssWidth: number,
  cssHeight: number,
  featureCount: number,
): BackingSize {
  return fitViewportBackingSize(cssWidth, cssHeight, {
    devicePixelRatio:
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    constrained: matchesConstrainedGpuProfile(),
    highFeatureCount: shouldWarnFeatureCount(featureCount),
  });
}
