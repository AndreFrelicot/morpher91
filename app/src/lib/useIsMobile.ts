import { useSyncExternalStore } from "react";

/**
 * Single source of truth for the mobile layout switch (PRD M12 lot 0).
 *
 * Capability-based, not user-agent sniffing: a narrow viewport OR a coarse
 * pointer on a not-wide viewport. The `(pointer: coarse)` arm catches phones
 * whose CSS width lands just above 767px in landscape while still being touch
 * devices; its `(orientation: landscape)` guard keeps portrait iPads
 * (768–1023px wide) on the desktop layout — the mobile shell targets phones,
 * not tablets. GPU budgets stay constrained on tablets regardless via
 * `constrainedProfile.ts`.
 */
export const MOBILE_MEDIA_QUERY =
  "(max-width: 767px), (pointer: coarse) and (max-width: 1023px) and (orientation: landscape)";

function getQuery(): MediaQueryList | null {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }
  return window.matchMedia(MOBILE_MEDIA_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = getQuery();
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return getQuery()?.matches ?? false;
}

/** Reactively reports whether the mobile layout should be used. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Non-reactive one-shot check, for imperative code (e.g. GPU canvas sizing) that
 * runs outside React render and just needs the current value.
 */
export function matchesMobile(): boolean {
  return getSnapshot();
}
