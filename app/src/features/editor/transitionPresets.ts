import type { BezierEasing, LayerTiming, NamedEasing } from "@/morph/model";

/**
 * Handle positions the custom editor starts from when switching away from a
 * named curve. `smoothstep` is exactly cubic-bezier(1/3, 0, 2/3, 1); the four
 * others use the CSS values of the same name.
 */
export const NAMED_EASING_HANDLES: Record<NamedEasing, BezierEasing> = {
  linear: { kind: "bezier", x1: 0, y1: 0, x2: 1, y2: 1 },
  "ease-in": { kind: "bezier", x1: 0.42, y1: 0, x2: 1, y2: 1 },
  "ease-out": { kind: "bezier", x1: 0, y1: 0, x2: 0.58, y2: 1 },
  "ease-in-out": { kind: "bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  smoothstep: { kind: "bezier", x1: 1 / 3, y1: 0, x2: 2 / 3, y2: 1 },
};

export type TransitionWindows = Pick<
  LayerTiming,
  "warpStart" | "warpEnd" | "dissolveStart" | "dissolveEnd"
>;

export type TransitionPresetId =
  | "standard"
  | "classicMorph"
  | "lateDissolve"
  | "custom";

/**
 * Named warp/dissolve window pairs (PRD §9.2). "Classic morph" warps over the
 * whole clip but only crossfades in the middle, so badly aligned areas do not
 * ghost at either end of the transition.
 */
export const TRANSITION_PRESETS: Record<
  Exclude<TransitionPresetId, "custom">,
  TransitionWindows
> = {
  standard: { warpStart: 0, warpEnd: 1, dissolveStart: 0, dissolveEnd: 1 },
  classicMorph: {
    warpStart: 0,
    warpEnd: 1,
    dissolveStart: 0.3,
    dissolveEnd: 0.7,
  },
  lateDissolve: {
    warpStart: 0,
    warpEnd: 1,
    dissolveStart: 0.6,
    dissolveEnd: 1,
  },
};

export const TRANSITION_PRESET_IDS = Object.keys(TRANSITION_PRESETS) as Exclude<
  TransitionPresetId,
  "custom"
>[];

/** Percent granularity of the inspector controls, so 0.3 and 0.300001 match. */
const EPSILON = 0.005;

const sameWindows = (a: TransitionWindows, b: TransitionWindows) =>
  Math.abs(a.warpStart - b.warpStart) < EPSILON &&
  Math.abs(a.warpEnd - b.warpEnd) < EPSILON &&
  Math.abs(a.dissolveStart - b.dissolveStart) < EPSILON &&
  Math.abs(a.dissolveEnd - b.dissolveEnd) < EPSILON;

/** The preset a timing currently matches, or "custom" for hand-tuned windows. */
export function matchTransitionPreset(
  timing: TransitionWindows,
): TransitionPresetId {
  for (const id of TRANSITION_PRESET_IDS) {
    if (sameWindows(timing, TRANSITION_PRESETS[id])) return id;
  }
  return "custom";
}

/** Applies a preset's windows, keeping the layer's easing untouched. */
export function applyTransitionPreset(
  timing: LayerTiming,
  id: Exclude<TransitionPresetId, "custom">,
): LayerTiming {
  return { ...timing, ...TRANSITION_PRESETS[id] };
}

/** Clamps a window to 0..1 with `start ≤ end`, moving the edge that was not set. */
export function normalizeWindow(
  start: number,
  end: number,
  moved: "start" | "end",
): { start: number; end: number } {
  const clamp01 = (value: number) =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const nextStart = clamp01(start);
  const nextEnd = clamp01(end);
  if (nextStart <= nextEnd) return { start: nextStart, end: nextEnd };
  return moved === "start"
    ? { start: nextEnd, end: nextEnd }
    : { start: nextStart, end: nextStart };
}
