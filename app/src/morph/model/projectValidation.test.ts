import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPointFeature, createRegionFeature } from "./featureFactory";
import { defaultPlacement, type ImageAsset } from "./image";
import { createLayer, normalizeLayerClip } from "./layers";
import { createProject } from "./project";
import {
  parseProjectV1,
  PROJECT_LIMITS,
  ProjectFileError,
  type ProjectFileErrorCode,
} from "./projectValidation";
import { serializeProject } from "./serialize";
import { normalizeVideoTimeline } from "./video";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 640,
  height: 480,
  source: { kind: "data-url", value: "data:image/png;base64,ZmFrZQ==" },
  placement: defaultPlacement(),
});

const document = () =>
  serializeProject(createProject(image("source.png"), image("target.png")));

const expectCode = (run: () => unknown, code: ProjectFileErrorCode) => {
  expect(run).toThrow(
    expect.objectContaining({
      code,
    }),
  );
};

describe("parseProjectV1", () => {
  it("round-trips normalized clip bounds despite floating-point rounding", () => {
    let seed = 0x20c0ffee;
    const random = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const pairs = [
      { total: 4.825, offset: 0.823 },
      ...Array.from({ length: 400 }, () => {
        const total = Math.round((2 + random() * 58) * 1_000) / 1_000;
        const offset =
          Math.round((0.1 + random() * (total - 0.2)) * 1_000) / 1_000;
        return { total, offset };
      }),
    ];

    for (const { total, offset } of pairs) {
      const project = createProject(image("source.png"), image("target.png"));
      project.timeline.durationSec = total;
      project.layers[0].clip = normalizeLayerClip(
        {
          startSec: offset,
          durationSec: total - offset,
        },
        total,
      );
      const userLayer = createLayer("Bounded");
      userLayer.clip = normalizeLayerClip(
        {
          startSec: offset,
          durationSec: total - offset,
        },
        total,
      );
      project.layers.push(userLayer);
      project.videos = {
        source: {
          id: "video-source",
          name: "source.mp4",
          width: 640,
          height: 480,
          durationSec: total,
          source: {
            kind: "external-video-placeholder",
            value: "source.mp4",
          },
          timeline: normalizeVideoTimeline(
            { startSec: 0, inSec: offset, durationSec: total - offset },
            total,
          ),
        },
      };

      expect(() =>
        parseProjectV1(JSON.parse(JSON.stringify(serializeProject(project)))),
      ).not.toThrow();
    }
  });

  it("round-trips a normalized zero-duration video clip", () => {
    const project = createProject(image("source.png"), image("target.png"));
    project.videos = {
      source: {
        id: "video-source",
        name: "source.mp4",
        width: 640,
        height: 480,
        durationSec: 4,
        source: {
          kind: "external-video-placeholder",
          value: "source.mp4",
        },
        timeline: normalizeVideoTimeline(
          { startSec: 0, inSec: 4, durationSec: 1 },
          4,
        ),
      },
    };

    expect(() =>
      parseProjectV1(JSON.parse(JSON.stringify(serializeProject(project)))),
    ).not.toThrow();
  });

  it("validates video keys against media duration and still keys against master time", () => {
    const input = document();
    input.timeline.durationSec = 4;
    input.videos = {
      target: {
        id: "trimmed-video",
        name: "trimmed.mp4",
        width: 640,
        height: 480,
        durationSec: 8,
        source: { kind: "external-video-placeholder", value: "trimmed.mp4" },
        timeline: { startSec: 0, inSec: 4, durationSec: 4 },
      },
    };
    const f = createPointFeature({ x: 0.4, y: 0.5 });
    f.tracks = { a: [{ timeSec: 4, pos: f.a }], b: [{ timeSec: 8, pos: f.b }] };
    input.features = [f];
    expect(parseProjectV1(input).features[0]).toEqual(f);
    f.tracks.b![0].timeSec = 8.1;
    expect(() => parseProjectV1(input)).toThrow(ProjectFileError);
    f.tracks.b![0].timeSec = 8;
    f.tracks.a![0].timeSec = 4.1;
    expect(() => parseProjectV1(input)).toThrow(ProjectFileError);
  });

  it("roundtrips image clips and rejects invalid spans", () => {
    const input = document();
    input.images.source.timeline = { startSec: 1, durationSec: 2 };
    expect(parseProjectV1(input).images.source.timeline).toEqual(
      input.images.source.timeline,
    );
    for (const clip of [
      { startSec: -1, durationSec: 2 },
      { startSec: 0, durationSec: 0 },
      { startSec: 3, durationSec: 2 },
      { startSec: 0, durationSec: NaN },
    ]) {
      input.images.source.timeline = clip;
      expect(() => parseProjectV1(input)).toThrow(ProjectFileError);
    }
  });

  it("accepts every bundled v1 demo preset", () => {
    const presetDirectory = join(process.cwd(), "public", "demo", "presets");
    for (const name of readdirSync(presetDirectory)) {
      if (!name.endsWith(".morph.json")) continue;
      try {
        parseProjectV1(
          JSON.parse(readFileSync(join(presetDirectory, name), "utf8")),
        );
      } catch (error) {
        const detail =
          error instanceof ProjectFileError
            ? `${error.code} at ${error.path ?? "unknown"}`
            : String(error);
        throw new Error(`${name}: ${detail}`, { cause: error });
      }
    }
  });

  it("migrates a pre-M24 clip easing onto the layer timing", () => {
    const input = document();
    input.timeline.durationSec = 8;
    const legacy = {
      ...input,
      layers: [
        {
          ...input.layers[0],
          clip: { startSec: 0, durationSec: 8, easing: "ease-in-out" },
        },
      ],
    };

    const parsed = parseProjectV1(legacy);

    expect(parsed.layers[0].timing.easing).toBe("ease-in-out");
    expect(parsed.layers[0].clip).toEqual({ startSec: 0, durationSec: 8 });
    expect(serializeProject(parsed).layers[0].clip).not.toHaveProperty(
      "easing",
    );
  });

  it("rejects an unknown pre-M24 clip easing", () => {
    const input = document();
    const legacy = {
      ...input,
      layers: [
        {
          ...input.layers[0],
          clip: { ...input.layers[0].clip, easing: "bouncy" },
        },
      ],
    };

    expectCode(() => parseProjectV1(legacy), "invalid-structure");
  });

  it("round-trips a custom bezier easing and a distinct dissolve curve", () => {
    const input = document();
    input.layers[0].timing = {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0.3,
      dissolveEnd: 0.7,
      easing: { kind: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
      dissolveEasing: "ease-out",
    };

    const parsed = parseProjectV1(
      JSON.parse(JSON.stringify(serializeProject(input))),
    );

    expect(parsed.layers[0].timing).toEqual(input.layers[0].timing);
  });

  it("rejects a bezier easing outside 0..1 or with an unknown kind", () => {
    const withEasing = (easing: unknown) => {
      const input = document();
      return {
        ...input,
        layers: [
          { ...input.layers[0], timing: { ...input.layers[0].timing, easing } },
        ],
      };
    };

    expectCode(
      () =>
        parseProjectV1(
          withEasing({ kind: "bezier", x1: 0.25, y1: 0.1, x2: 1.5, y2: 1 }),
        ),
      "invalid-structure",
    );
    expectCode(
      () =>
        parseProjectV1(
          withEasing({ kind: "spline", x1: 0, y1: 0, x2: 1, y2: 1 }),
        ),
      "invalid-structure",
    );
  });

  it("keeps transition windows inside 0..1", () => {
    const input = document();
    const outOfRange = {
      ...input,
      layers: [
        {
          ...input.layers[0],
          timing: { ...input.layers[0].timing, dissolveEnd: 1.5 },
        },
      ],
    };

    expectCode(() => parseProjectV1(outOfRange), "invalid-structure");
  });

  it("constructs an independent project and migrates only absent layers", () => {
    const input = document();
    input.timeline.durationSec = 8;
    const legacy = { ...input, layers: undefined };

    const parsed = parseProjectV1(legacy);

    expect(parsed).not.toBe(input);
    expect(parsed.images.source).not.toBe(input.images.source);
    expect(parsed.layers).toHaveLength(1);
    expect(parsed.layers[0]).toMatchObject({
      id: "global",
      clip: { startSec: 0, durationSec: 8 },
    });
  });

  it("rejects non-finite numbers before hydration", () => {
    const input = document();
    input.timeline.durationSec = Number.POSITIVE_INFINITY;
    expectCode(() => parseProjectV1(input), "invalid-structure");
  });

  it("rejects invalid enums and source kinds", () => {
    const invalidEnum = document();
    const canvas = invalidEnum.canvas as { background: unknown };
    canvas.background = "purple";
    expectCode(() => parseProjectV1(invalidEnum), "invalid-structure");

    const invalidSource = document();
    const source = invalidSource.images.source.source as { kind: unknown };
    source.kind = "https";
    expectCode(() => parseProjectV1(invalidSource), "invalid-structure");
  });

  it("accepts image data URLs with a generic MIME type", () => {
    const input = document();
    input.images.source.source = {
      kind: "data-url",
      value: "data:application/octet-stream;base64,ZmFrZQ==",
    };

    expect(parseProjectV1(input).images.source.source).toEqual(
      input.images.source.source,
    );
  });

  it("rejects oversized feature and layer arrays", () => {
    const tooManyFeatures = document() as unknown as Record<string, unknown>;
    tooManyFeatures.features = Array.from(
      { length: PROJECT_LIMITS.features + 1 },
      () => ({}),
    );
    expectCode(() => parseProjectV1(tooManyFeatures), "limit-exceeded");

    const tooManyLayers = document() as unknown as Record<string, unknown>;
    tooManyLayers.layers = Array.from(
      { length: PROJECT_LIMITS.layers + 1 },
      () => ({}),
    );
    expectCode(() => parseProjectV1(tooManyLayers), "limit-exceeded");
  });

  it("rejects orphan layer and feature references", () => {
    const orphanLayer = document();
    orphanLayer.features.push({
      ...createPointFeature({ x: 0.2, y: 0.3 }),
      layerId: "missing",
    });
    expectCode(() => parseProjectV1(orphanLayer), "invalid-reference");

    const orphanFeature = document();
    orphanFeature.layers[0].featureIds = ["missing"];
    expectCode(() => parseProjectV1(orphanFeature), "invalid-reference");
  });

  it("rejects too many cumulative keyframes", () => {
    const input = document();
    const feature = createPointFeature({ x: 0.2, y: 0.3 });
    feature.tracks = {
      a: Array.from({ length: PROJECT_LIMITS.keyframes }, () => ({
        timeSec: 0,
        pos: { x: 0.2, y: 0.3 },
      })),
      b: [{ timeSec: 0, pos: { x: 0.2, y: 0.3 } }],
    };
    input.features.push(feature);
    expectCode(() => parseProjectV1(input), "limit-exceeded");
  });

  it("accepts an exact painted mask and rejects truncated or oversized masks", () => {
    const exact = document();
    exact.layers[0].paintedMask = {
      width: 1,
      height: 1,
      data: "Af8=",
    };
    expect(parseProjectV1(exact).layers[0].paintedMask).toEqual(
      exact.layers[0].paintedMask,
    );

    const truncated = document();
    truncated.layers[0].paintedMask = {
      width: 1,
      height: 1,
      data: "AQ==",
    };
    expectCode(() => parseProjectV1(truncated), "invalid-mask");

    const oversized = document();
    oversized.layers[0].paintedMask = {
      width: PROJECT_LIMITS.paintedMaskEdge + 1,
      height: 1,
      data: "",
    };
    expectCode(() => parseProjectV1(oversized), "limit-exceeded");
  });

  it("requires vector masks to reference a region feature", () => {
    const input = document();
    const point = createPointFeature({ x: 0.2, y: 0.3 });
    input.features.push(point);
    input.layers[0].mask = {
      featureId: point.id,
      mode: "hard",
      feather: 0,
    };
    expectCode(() => parseProjectV1(input), "invalid-reference");

    const valid = document();
    const region = createRegionFeature([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ]);
    valid.features.push(region);
    valid.layers[0].mask = {
      featureId: region.id,
      mode: "feathered",
      feather: 0.1,
    };
    expect(parseProjectV1(valid).layers[0].mask?.featureId).toBe(region.id);
  });
});
