import { describe, expect, it } from "vitest";
import {
  createPointFeature,
  createProject,
  defaultPlacement,
  type ImageAsset,
  type MorphProject,
  type VideoAsset,
} from "@/morph/model";
import {
  collectKeyframeMarkers,
  groupKeyframeMarkers,
} from "./keyframeMarkerModel";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 64,
  height: 64,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

function projectWithVideos(): MorphProject {
  const project = createProject(image("a"), image("b"));
  const video = (name: string, startSec: number): VideoAsset => ({
    id: name,
    name,
    width: 64,
    height: 64,
    source: { kind: "object-url", value: name },
    durationSec: 6,
    fps: 30,
    timeline: { startSec, inSec: 0, durationSec: 4 },
  });
  return {
    ...project,
    timeline: { ...project.timeline, durationSec: 10 },
    videos: { source: video("va", 0), target: video("vb", 2) },
  };
}

describe("collectKeyframeMarkers (M25)", () => {
  it("filters still-image keys to the clip without shifting master time", () => {
    const project = createProject(image("a"), image("b"));
    project.images.source.timeline = { startSec: 1, durationSec: 2 };
    const point = createPointFeature({ x: 0.5, y: 0.5 });
    point.tracks = {
      a: [0, 1, 2, 3, 4].map((timeSec) => ({ timeSec, pos: point.a })),
    };
    project.features = [point];
    expect(
      collectKeyframeMarkers(project, [point.id], "source", (f) => f.id).map(
        (m) => m.masterSec,
      ),
    ).toEqual([1, 2, 3]);
    expect(point.tracks.a).toHaveLength(5);
  });

  it("maps side-local keyframes of selected features to master τ per track", () => {
    const project = projectWithVideos();
    const p1 = createPointFeature({ x: 0.1, y: 0.1 });
    p1.tracks = {
      a: [{ timeSec: 1, pos: p1.a }],
      b: [{ timeSec: 1, pos: p1.b }],
    };
    const p2 = createPointFeature({ x: 0.5, y: 0.5 });
    p2.tracks = { a: [{ timeSec: 1.001, pos: p2.a }] };
    project.features = [p1, p2];
    const name = (f: { id: string }) => f.id;

    const a = collectKeyframeMarkers(project, [p1.id, p2.id], "source", name);
    expect(a).toHaveLength(1);
    expect(a[0].masterSec).toBeCloseTo(1);
    expect(a[0].features.map((f) => f.id)).toEqual([p1.id, p2.id]);

    // Track B starts at τ = 2 s: local 1 s is presented at τ = 3 s.
    const b = collectKeyframeMarkers(project, [p1.id, p2.id], "target", name);
    expect(b).toHaveLength(1);
    expect(b[0].masterSec).toBeCloseTo(3);
    expect(b[0].localSec).toBe(1);

    expect(collectKeyframeMarkers(project, [], "source", name)).toEqual([]);
    expect(collectKeyframeMarkers(project, [p2.id], "target", name)).toEqual(
      [],
    );
  });

  it("drops keyframes outside the trimmed clip span and sorts by τ", () => {
    const project = projectWithVideos();
    const p = createPointFeature({ x: 0.1, y: 0.1 });
    p.tracks = {
      a: [
        { timeSec: 5, pos: p.a }, // beyond the 4 s clip duration
        { timeSec: 3, pos: p.a },
        { timeSec: 0.5, pos: p.a },
      ],
    };
    project.features = [p];
    const markers = collectKeyframeMarkers(
      project,
      [p.id],
      "source",
      () => "p",
    );
    expect(markers.map((m) => m.localSec)).toEqual([0.5, 3]);
  });
});

describe("groupKeyframeMarkers (M25)", () => {
  const marker = (masterSec: number) => ({
    masterSec,
    localSec: masterSec,
    features: [{ id: "f", name: "f" }],
  });

  it("merges runs of markers closer than the pixel gap and keeps the rest", () => {
    // 10 s over 1000 px: 1 px = 0.01 s; gap of 6 px = 0.06 s.
    const groups = groupKeyframeMarkers(
      [
        marker(1),
        marker(1.02),
        marker(1.05),
        marker(2),
        marker(3),
        marker(3.1),
      ],
      10,
      1000,
      6,
    );
    expect(groups.map((g) => g.markers.length)).toEqual([3, 1, 1, 1]);
  });

  it("never groups when the width is unknown", () => {
    const groups = groupKeyframeMarkers([marker(1), marker(1.01)], 10, 0, 6);
    expect(groups).toHaveLength(2);
  });
});

describe("collectKeyframeMarkers on still images (M25 follow-up)", () => {
  it("places keyframes at master τ over the whole timeline when the slot has no video", () => {
    const project = {
      ...createProject(image("a"), image("b")),
      timeline: { durationSec: 4, fps: 30, loop: true, pingPong: false },
    };
    const p = createPointFeature({ x: 0.1, y: 0.1 });
    p.tracks = {
      a: [
        { timeSec: 5, pos: p.a }, // beyond the 4 s timeline
        { timeSec: 2.5, pos: p.a },
        { timeSec: 0, pos: p.a },
      ],
    };
    project.features = [p];
    const markers = collectKeyframeMarkers(
      project,
      [p.id],
      "source",
      () => "p",
    );
    expect(markers.map((m) => [m.localSec, m.masterSec])).toEqual([
      [0, 0],
      [2.5, 2.5],
    ]);
  });
});
