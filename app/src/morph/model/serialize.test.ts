import { describe, expect, it } from "vitest";
import { createProject } from "./project";
import {
  createPointFeature,
  createPolylineFeature,
  createRegionFeature,
} from "./featureFactory";
import { defaultPlacement, type ImageAsset } from "./image";
import { defaultVideoTimeline, type VideoAsset } from "./video";
import { deserializeProject, serializeProject } from "./serialize";

function uploadedImage(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 640,
    height: 480,
    source: { kind: "object-url", value: "blob:abc" },
    placement: defaultPlacement(),
  };
}

function embeddedImage(name: string): ImageAsset {
  return {
    ...uploadedImage(name),
    source: { kind: "data-url", value: "data:image/png;base64,ZmFrZQ==" },
  };
}

function uploadedVideo(name: string): VideoAsset {
  return {
    id: name,
    name,
    width: 1920,
    height: 1080,
    durationSec: 5,
    fingerprint: `${name}:123:456`,
    source: { kind: "object-url", value: "blob:video" },
    timeline: defaultVideoTimeline(5),
  };
}

describe("serializeProject", () => {
  it("preserves embedded image data urls", () => {
    const project = createProject(
      embeddedImage("a.png"),
      embeddedImage("b.png"),
    );
    const s = serializeProject(project);
    expect(s.images.source.source).toEqual({
      kind: "data-url",
      value: "data:image/png;base64,ZmFrZQ==",
    });
    expect(s.images.target.source.kind).toBe("data-url");
  });

  it("replaces legacy object URLs with a filename placeholder", () => {
    const project = createProject(
      uploadedImage("a.png"),
      uploadedImage("b.png"),
    );
    const s = serializeProject(project);
    expect(s.images.source.source).toEqual({
      kind: "external-file-placeholder",
      value: "a.png",
    });
    expect(s.images.target.source.kind).toBe("external-file-placeholder");
  });

  it("replaces local videos with external video placeholders", () => {
    const project = createProject(embeddedImage("a"), embeddedImage("b"));
    project.videos = {
      source: uploadedVideo("a.mov"),
      target: uploadedVideo("b.mov"),
    };

    const s = serializeProject(project);
    expect(s.videos?.source?.source).toEqual({
      kind: "external-video-placeholder",
      value: "a.mov",
    });
    expect(s.videos?.target?.durationSec).toBe(5);
    expect(s.videos?.source?.fingerprint).toBe("a.mov:123:456");
  });

  it("round-trips video identity, fingerprint, timeline, features, and layers", () => {
    const project = createProject(embeddedImage("a"), embeddedImage("b"));
    const feature = createPointFeature({ x: 0.2, y: 0.3 });
    project.features.push(feature);
    project.timeline.durationSec = 10;
    project.layers[0].clip = { startSec: 0, durationSec: 10 };
    project.videos = {
      source: {
        ...uploadedVideo("a.mov"),
        timeline: { startSec: 2, inSec: 1, durationSec: 3 },
      },
    };

    const restored = deserializeProject(
      JSON.stringify(serializeProject(project)),
    );

    expect(restored.videos?.source).toMatchObject({
      id: "a.mov",
      fingerprint: "a.mov:123:456",
      timeline: { startSec: 2, inSec: 1, durationSec: 3 },
      source: { kind: "external-video-placeholder", value: "a.mov" },
    });
    expect(restored.features[0].id).toBe(feature.id);
    expect(restored.layers[0].clip?.durationSec).toBe(10);
  });

  it("round-trips features and settings through JSON", () => {
    const project = createProject(embeddedImage("a"), embeddedImage("b"));
    project.features.push(
      createPointFeature({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }),
    );
    project.activeAlgorithm = "thin-plate-spline";
    project.timeline.durationSec = 6;

    const restored = deserializeProject(
      JSON.stringify(serializeProject(project)),
    );
    expect(restored.features).toHaveLength(1);
    expect(restored.features[0]).toMatchObject({
      kind: "point",
      a: { x: 0.2, y: 0.3 },
      b: { x: 0.6, y: 0.7 },
    });
    expect(restored.activeAlgorithm).toBe("thin-plate-spline");
    expect(restored.timeline.durationSec).toBe(6);
  });

  it("round-trips the optional smooth/closed contour flags", () => {
    const project = createProject(embeddedImage("a"), embeddedImage("b"));
    project.features.push({
      ...createPolylineFeature([
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.2 },
        { x: 0.3, y: 0.6 },
      ]),
      smooth: true,
      closed: true,
    });

    const restored = deserializeProject(
      JSON.stringify(serializeProject(project)),
    );
    expect(restored.features[0]).toMatchObject({
      kind: "polyline",
      smooth: true,
      closed: true,
    });
  });

  it("round-trips keyframed region mask tracks (M11 lot 4a)", () => {
    const project = createProject(embeddedImage("a"), embeddedImage("b"));
    const region = createRegionFeature([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ]);
    region.tracks = {
      a: [
        { timeSec: 0, points: region.a },
        {
          timeSec: 2,
          points: [
            { x: 0.2, y: 0.1 },
            { x: 1, y: 0.1 },
            { x: 0.6, y: 0.9 },
          ],
        },
      ],
    };
    project.features.push(region);

    const restored = deserializeProject(
      JSON.stringify(serializeProject(project)),
    );
    expect(restored.features[0]).toMatchObject({
      kind: "region",
      tracks: {
        a: [
          { timeSec: 0 },
          {
            timeSec: 2,
            points: [
              { x: 0.2, y: 0.1 },
              { x: 1, y: 0.1 },
              { x: 0.6, y: 0.9 },
            ],
          },
        ],
      },
    });
  });

  it("fills the global layer when loading an older v1 document", () => {
    const project = createProject(embeddedImage("a"), embeddedImage("b"));
    const data = serializeProject(project) as Partial<typeof project>;
    delete data.layers;

    const restored = deserializeProject(JSON.stringify(data));
    expect(restored.layers).toHaveLength(1);
    expect(restored.layers[0].id).toBe("global");
  });
});

describe("deserializeProject", () => {
  it("rejects invalid JSON", () => {
    expect(() => deserializeProject("{not json")).toThrow(
      expect.objectContaining({ code: "invalid-json" }),
    );
  });

  it("rejects an unknown version or shape", () => {
    expect(() => deserializeProject(JSON.stringify({ version: 2 }))).toThrow(
      expect.objectContaining({
        code: "unsupported-version",
      }),
    );
  });
});
