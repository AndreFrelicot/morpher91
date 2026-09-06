import { describe, expect, it } from "vitest";
import { resolveTimelineFramePair } from "@/morph/model";
import {
  imageImageRenderFixture,
  layeredGapRenderFixture,
  videoImageRenderFixture,
} from "@/test/renderFixtures";

const slots = { a: "source-frame", b: "target-frame" } as const;

describe("preview/export render parity fixtures", () => {
  it("keeps both static image slots present throughout the timeline", () => {
    const project = imageImageRenderFixture();

    expect(resolveTimelineFramePair(project, 0, slots)).toBe(slots);
    expect(resolveTimelineFramePair(project, 4, slots)).toBe(slots);
  });

  it("resolves still-image overlap, gaps and independent video/image presence", () => {
    const project = imageImageRenderFixture();
    project.images.source.timeline = { startSec: 0, durationSec: 1 };
    project.images.target.timeline = { startSec: 2, durationSec: 2 };
    expect(resolveTimelineFramePair(project, 1, slots)).toEqual({
      a: slots.a,
      b: slots.a,
    });
    expect(resolveTimelineFramePair(project, 1.5, slots)).toBeNull();
    expect(resolveTimelineFramePair(project, 2, slots)).toEqual({
      a: slots.b,
      b: slots.b,
    });
    project.images.source.timeline.durationSec = 3;
    expect(resolveTimelineFramePair(project, 2.5, slots)).toBe(slots);
    const mixed = videoImageRenderFixture();
    mixed.images.target.timeline = { startSec: 0, durationSec: 1.5 };
    expect(resolveTimelineFramePair(mixed, 1.25, slots)).toBe(slots);
    expect(resolveTimelineFramePair(mixed, 2, slots)).toEqual({
      a: slots.a,
      b: slots.a,
    });
    expect(resolveTimelineFramePair(mixed, 3.5, slots)).toBeNull();
  });

  it("falls back to the static target outside a source video clip", () => {
    const project = videoImageRenderFixture();

    expect(resolveTimelineFramePair(project, 0.999, slots)).toEqual({
      a: slots.b,
      b: slots.b,
    });
    expect(resolveTimelineFramePair(project, 1, slots)).toBe(slots);
    expect(resolveTimelineFramePair(project, 2, slots)).toBe(slots);
    expect(resolveTimelineFramePair(project, 3, slots)).toBe(slots);
    expect(resolveTimelineFramePair(project, 3.001, slots)).toEqual({
      a: slots.b,
      b: slots.b,
    });
  });

  it("returns no stale frame in the gap between two staggered video clips", () => {
    const project = layeredGapRenderFixture();

    expect(resolveTimelineFramePair(project, 0.999, slots)).toBeNull();
    expect(resolveTimelineFramePair(project, 1, slots)).toEqual({
      a: slots.a,
      b: slots.a,
    });
    expect(resolveTimelineFramePair(project, 2, slots)).toEqual({
      a: slots.a,
      b: slots.a,
    });
    expect(resolveTimelineFramePair(project, 3, slots)).toEqual({
      a: slots.a,
      b: slots.a,
    });
    expect(resolveTimelineFramePair(project, 3.001, slots)).toBeNull();
    expect(resolveTimelineFramePair(project, 4, slots)).toEqual({
      a: slots.b,
      b: slots.b,
    });
    expect(resolveTimelineFramePair(project, 6, slots)).toEqual({
      a: slots.b,
      b: slots.b,
    });
    expect(resolveTimelineFramePair(project, 6.001, slots)).toBeNull();

    expect(project.layers).toHaveLength(3);
    expect(project.layers[1].mask).toBeDefined();
    expect(project.layers[2].paintedMask).toBeDefined();
  });
});
