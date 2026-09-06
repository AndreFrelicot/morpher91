import { describe, expect, it } from "vitest";
import { defaultExportSettings, type ExportSettings } from "@/morph/model";
import { computeFrameCount, computeFrameTimes } from "./exportTiming";

const settings = (patch: Partial<ExportSettings> = {}): ExportSettings => ({
  ...defaultExportSettings,
  ...patch,
});

describe("computeFrameCount", () => {
  it("is durationSec * fps", () => {
    expect(computeFrameCount(settings({ durationSec: 4, fps: 30 }))).toBe(120);
    expect(computeFrameCount(settings({ durationSec: 2, fps: 60 }))).toBe(120);
  });

  it("rounds to the nearest frame", () => {
    expect(computeFrameCount(settings({ durationSec: 1.01, fps: 30 }))).toBe(
      30,
    );
  });

  it("never drops below 2 frames", () => {
    expect(computeFrameCount(settings({ durationSec: 0, fps: 30 }))).toBe(2);
  });
});

describe("computeFrameTimes", () => {
  it("spans startT..endT linearly", () => {
    const times = computeFrameTimes(settings({ durationSec: 1, fps: 5 }));
    expect(times).toHaveLength(5);
    expect(times[0]).toBeCloseTo(0);
    expect(times[2]).toBeCloseTo(0.5);
    expect(times.at(-1)).toBeCloseTo(1);
  });

  it("honours a sub-range", () => {
    const times = computeFrameTimes(
      settings({ durationSec: 1, fps: 5, startT: 0.25, endT: 0.75 }),
    );
    expect(times[0]).toBeCloseTo(0.25);
    expect(times.at(-1)).toBeCloseTo(0.75);
    expect(times[2]).toBeCloseTo(0.5);
  });

  it("ping-pong returns to the start (A→B→A)", () => {
    const times = computeFrameTimes(
      settings({ durationSec: 1, fps: 5, includePingPong: true }),
    );
    expect(times[0]).toBeCloseTo(0);
    expect(times[2]).toBeCloseTo(1); // midpoint reaches endT
    expect(times.at(-1)).toBeCloseTo(0); // back to startT
  });

  it("ping-pong stays within startT..endT", () => {
    const times = computeFrameTimes(
      settings({
        durationSec: 1,
        fps: 9,
        startT: 0.2,
        endT: 0.8,
        includePingPong: true,
      }),
    );
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(t).toBeLessThanOrEqual(0.8 + 1e-9);
    }
    expect(Math.max(...times)).toBeCloseTo(0.8);
  });
});
