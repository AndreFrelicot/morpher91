import { describe, expect, it } from "vitest";
import { defaultVideoTimeline, type VideoAsset } from "./video";
import {
  assertVideoRelinkCandidate,
  videoMatchesSavedAsset,
  VideoRelinkError,
} from "./videoRelink";

const video = (patch: Partial<VideoAsset> = {}): VideoAsset => ({
  id: "saved",
  name: "saved.mov",
  width: 1920,
  height: 1080,
  durationSec: 5,
  fingerprint: "saved.mov:100:123",
  source: { kind: "external-video-placeholder", value: "saved.mov" },
  timeline: defaultVideoTimeline(5),
  ...patch,
});

describe("video relink matching", () => {
  it("accepts an exact fingerprint", () => {
    expect(
      videoMatchesSavedAsset(
        video(),
        video({ width: 1, height: 1, durationSec: 1 }),
      ),
    ).toBe(true);
  });

  it("accepts a renamed file with matching dimensions and duration tolerance", () => {
    expect(
      videoMatchesSavedAsset(
        video(),
        video({
          name: "renamed.mov",
          fingerprint: "renamed.mov:200:456",
          durationSec: 5.1,
        }),
      ),
    ).toBe(true);
  });

  it("rejects a dimension or duration mismatch with a stable code", () => {
    expect(() =>
      assertVideoRelinkCandidate(
        video(),
        video({ durationSec: 5.1001, fingerprint: "different" }),
      ),
    ).toThrow(expect.objectContaining({ code: "mismatch" }));
    expect(() =>
      assertVideoRelinkCandidate(
        video(),
        video({ width: 1280, fingerprint: "different" }),
      ),
    ).toThrow(VideoRelinkError);
  });
});
