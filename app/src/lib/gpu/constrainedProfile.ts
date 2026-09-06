import { matchesMobile } from "@/lib/useIsMobile";

export const CONSTRAINED_GPU_MEDIA_QUERY = "(pointer: coarse)";

export type GpuProfileCapabilities = {
  mobileLayout: boolean;
  coarsePointer: boolean;
  maxTouchPoints: number;
};

/** Keeps GPU limits independent from the responsive shell breakpoint. */
export function isConstrainedGpuProfile({
  mobileLayout,
  coarsePointer,
  maxTouchPoints,
}: GpuProfileCapabilities): boolean {
  return mobileLayout || coarsePointer || maxTouchPoints > 0;
}

/** Imperative capability check used while sizing WebGPU backing stores. */
export function matchesConstrainedGpuProfile(): boolean {
  if (typeof window === "undefined") return false;
  return isConstrainedGpuProfile({
    mobileLayout: matchesMobile(),
    coarsePointer:
      typeof window.matchMedia === "function" &&
      window.matchMedia(CONSTRAINED_GPU_MEDIA_QUERY).matches,
    maxTouchPoints: window.navigator?.maxTouchPoints ?? 0,
  });
}
