import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MOBILE_MEDIA_QUERY, useIsMobile } from "./useIsMobile";

type Listener = () => void;

/** Minimal controllable matchMedia stub (jsdom ships none). */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    media: MOBILE_MEDIA_QUERY,
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    setMatches(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useIsMobile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports false on a desktop-width viewport", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("reports true when the media query matches", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("reacts to viewport changes", () => {
    const ctl = stubMatchMedia(false);
    const { result, rerender } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    ctl.setMatches(true);
    rerender();
    expect(result.current).toBe(true);
  });

  it("falls back to false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
