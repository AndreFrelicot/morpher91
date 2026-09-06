import { describe, expect, it } from "vitest";
import {
  createProject,
  defaultExportSettings,
  defaultPlacement,
  defaultVideoTimeline,
  type ImageAsset,
} from "@/morph/model";
import {
  effectiveExportDuration,
  EXPORT_LIMITS,
  ExportError,
  validateExportJob,
} from "./exportValidation";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 640,
  height: 480,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

const project = () => createProject(image("a"), image("b"));

const expectCode = (run: () => unknown, code: ExportError["code"]) => {
  expect(run).toThrow(expect.objectContaining({ code }));
};

describe("validateExportJob", () => {
  it.each([
    ["width", 15, "invalid-dimensions"],
    ["width", 3_841, "invalid-dimensions"],
    ["height", 15, "invalid-dimensions"],
    ["height", 2_161, "invalid-dimensions"],
    ["fps", 11, "invalid-fps"],
    ["fps", 61, "invalid-fps"],
    ["durationSec", 0.5, "invalid-duration"],
    ["durationSec", 15.1, "invalid-duration"],
    ["bitrate", 999_999, "invalid-bitrate"],
    ["bitrate", 20_000_001, "invalid-bitrate"],
  ] as const)("rejects %s=%s", (field, value, code) => {
    const settings = { ...defaultExportSettings, [field]: value };
    expectCode(() => validateExportJob(project(), settings), code);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite values (%s)",
    (value) => {
      expectCode(
        () =>
          validateExportJob(project(), {
            ...defaultExportSettings,
            fps: value,
          }),
        "invalid-fps",
      );
    },
  );

  it("computes video duration from the selected range without doubling ping-pong", () => {
    const input = project();
    input.timeline.durationSec = 10;
    input.videos = {
      source: {
        id: "video",
        name: "video.mov",
        width: 640,
        height: 480,
        durationSec: 10,
        source: { kind: "external-video-placeholder", value: "video.mov" },
        timeline: defaultVideoTimeline(10),
      },
    };
    const settings = {
      ...defaultExportSettings,
      startT: 0.2,
      endT: 0.7,
      includePingPong: true,
    };
    expect(effectiveExportDuration(input, settings)).toBeCloseTo(5);
    expect(validateExportJob(input, settings).frameCount).toBe(150);
  });

  it("accepts 900 frames and rejects the next frame", () => {
    expect(
      validateExportJob(project(), {
        ...defaultExportSettings,
        durationSec: 15,
        fps: 60,
      }).frameCount,
    ).toBe(EXPORT_LIMITS.maxFrames);
    expectCode(
      () =>
        validateExportJob(project(), {
          ...defaultExportSettings,
          durationSec: 15,
          fps: 60.1,
        }),
      "invalid-fps",
    );
  });

  it("checks sequence pixel-frames exactly at the limit", () => {
    const width = 1_000;
    const height = 1_000;
    const exact = {
      ...defaultExportSettings,
      outputKind: "frames" as const,
      width,
      height,
      durationSec: 10,
      fps: 30,
    };
    expect(validateExportJob(project(), exact).sequencePixelFrames).toBe(
      EXPORT_LIMITS.maxSequencePixelFrames,
    );
    expectCode(
      () =>
        validateExportJob(project(), {
          ...exact,
          width: width + 1,
        }),
      "sequence-too-large",
    );
  });

  it("checks the resolved GPU texture limit", () => {
    expectCode(
      () =>
        validateExportJob(project(), defaultExportSettings, {
          deviceLimits: { maxTextureDimension2D: 1_024 },
        }),
      "device-dimension-limit",
    );
  });
});
