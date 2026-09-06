import { describe, expect, it } from "vitest";
import { frameIndexForTime, timeForFrameIndex } from "./frameIndex";

describe("frameIndexForTime", () => {
  it("keys consecutive 30 fps timeline steps onto the 24 fps source frames they show", () => {
    // Timeline steps 0, 1/30, 2/30, 3/30 → source frames 0, 0, 1, 2.
    const indices = [0, 1, 2, 3].map((k) => frameIndexForTime(k / 30, 0, 24));
    expect(indices).toEqual([0, 0, 1, 2]);
  });

  it("treats a time on a frame boundary as that frame", () => {
    expect(frameIndexForTime(5 / 24, 0, 24)).toBe(5);
    expect(frameIndexForTime(5 / 24 - 1e-9, 0, 24)).toBe(5);
    expect(frameIndexForTime(5 / 24 - 1e-3, 0, 24)).toBe(4);
  });

  it("offsets by the track's first timestamp and clamps earlier times to 0", () => {
    expect(frameIndexForTime(0.5, 0.5, 24)).toBe(0);
    expect(frameIndexForTime(0.5 + 3 / 24, 0.5, 24)).toBe(3);
    expect(frameIndexForTime(0, 0.5, 24)).toBe(0);
    expect(frameIndexForTime(Number.NaN, 0.5, 24)).toBe(0);
  });
});

describe("timeForFrameIndex", () => {
  it("round-trips with frameIndexForTime", () => {
    for (const index of [0, 1, 7, 165]) {
      const time = timeForFrameIndex(index, 0.25, 24);
      expect(frameIndexForTime(time, 0.25, 24)).toBe(index);
    }
  });
});
