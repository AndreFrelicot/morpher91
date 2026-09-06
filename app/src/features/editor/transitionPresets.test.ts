import { describe, expect, it } from "vitest";
import { defaultGlobalLayer } from "@/morph/model";
import {
  applyTransitionPreset,
  matchTransitionPreset,
  normalizeWindow,
  TRANSITION_PRESETS,
} from "./transitionPresets";

describe("transition presets", () => {
  it("recognizes the default 0..1 windows as Standard", () => {
    expect(matchTransitionPreset(defaultGlobalLayer().timing)).toBe("standard");
  });

  it("recognizes the classic morph and late dissolve windows", () => {
    expect(matchTransitionPreset(TRANSITION_PRESETS.classicMorph)).toBe(
      "classicMorph",
    );
    expect(matchTransitionPreset(TRANSITION_PRESETS.lateDissolve)).toBe(
      "lateDissolve",
    );
  });

  it("falls back to custom for hand-tuned windows", () => {
    expect(
      matchTransitionPreset({
        warpStart: 0.1,
        warpEnd: 0.9,
        dissolveStart: 0.2,
        dissolveEnd: 0.8,
      }),
    ).toBe("custom");
  });

  it("applies a preset's windows and keeps the layer easing", () => {
    const timing = {
      ...defaultGlobalLayer().timing,
      easing: "linear" as const,
    };

    const next = applyTransitionPreset(timing, "classicMorph");

    expect(next).toEqual({
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0.3,
      dissolveEnd: 0.7,
      easing: "linear",
    });
  });

  it("constrains a window to 0..1 with start ≤ end", () => {
    expect(normalizeWindow(0.8, 0.5, "start")).toEqual({
      start: 0.5,
      end: 0.5,
    });
    expect(normalizeWindow(0.8, 0.5, "end")).toEqual({ start: 0.8, end: 0.8 });
    expect(normalizeWindow(-1, 4, "end")).toEqual({ start: 0, end: 1 });
    expect(normalizeWindow(Number.NaN, 0.5, "start")).toEqual({
      start: 0,
      end: 0.5,
    });
  });
});
