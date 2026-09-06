import type { AlgorithmSettings } from "./algorithms";
import type { FeatureBase, FeaturePair } from "./features";
import type { ImageAsset, ImagePlacement } from "./image";
import {
  defaultGlobalLayer,
  defaultLayerClip,
  GLOBAL_LAYER_ID,
  NAMED_EASINGS,
  type Easing,
  type LayerTiming,
  type MorphLayer,
} from "./layers";
import type { PaintedMask } from "./paintedMask";
import type { CanvasSettings, MorphProject, TimelineSettings } from "./project";
import type { MorphAlgorithmId, NormalizedVec2, Vec2 } from "./types";
import type { ProjectVideos, VideoAsset, VideoTimeline } from "./video";

export const PROJECT_LIMITS = {
  layers: 16,
  features: 5_000,
  keyframes: 20_000,
  timelineDurationSec: 3_600,
  logicalDimension: 16_384,
  paintedMaskEdge: 2_048,
  paintedMaskBytes: 4_194_304,
} as const;

export type ProjectFileErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-structure"
  | "limit-exceeded"
  | "invalid-reference"
  | "invalid-mask";

export class ProjectFileError extends Error {
  readonly code: ProjectFileErrorCode;
  readonly path?: string;

  constructor(code: ProjectFileErrorCode, path?: string) {
    super(code);
    this.name = "ProjectFileError";
    this.code = code;
    this.path = path;
  }
}

type RecordValue = Record<string, unknown>;

const TIME_TOLERANCE_SEC = 1e-6;

const fail = (code: ProjectFileErrorCode, path?: string): never => {
  throw new ProjectFileError(code, path);
};

export const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown, path: string): RecordValue =>
  isRecord(value) ? value : fail("invalid-structure", path);

export const finiteNumber = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : fail("invalid-structure", path);

const boundedNumber = (
  value: unknown,
  path: string,
  min: number,
  max: number,
): number => {
  const parsed = finiteNumber(value, path);
  return parsed >= min && parsed <= max
    ? parsed
    : fail("invalid-structure", path);
};

const boundedTime = (
  value: unknown,
  path: string,
  min: number,
  max: number,
): number => {
  const parsed = finiteNumber(value, path);
  if (parsed < min - TIME_TOLERANCE_SEC || parsed > max + TIME_TOLERANCE_SEC) {
    return fail("invalid-structure", path);
  }
  return Math.min(max, Math.max(min, parsed));
};

const integer = (
  value: unknown,
  path: string,
  min: number,
  max: number,
): number => {
  const parsed = finiteNumber(value, path);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fail("invalid-structure", path);
};

const limitedNumber = (
  value: unknown,
  path: string,
  min: number,
  max: number,
): number => {
  const parsed = finiteNumber(value, path);
  if (parsed < min) return fail("invalid-structure", path);
  return parsed <= max ? parsed : fail("limit-exceeded", path);
};

const limitedInteger = (
  value: unknown,
  path: string,
  min: number,
  max: number,
): number => {
  const parsed = finiteNumber(value, path);
  if (!Number.isInteger(parsed) || parsed < min) {
    return fail("invalid-structure", path);
  }
  return parsed <= max ? parsed : fail("limit-exceeded", path);
};

const text = (value: unknown, path: string, allowEmpty = false): string => {
  if (typeof value !== "string" || value.length > 10_000) {
    return fail("invalid-structure", path);
  }
  if (!allowEmpty && value.trim().length === 0) {
    return fail("invalid-structure", path);
  }
  return value;
};

const sourceText = (value: unknown, path: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 * 1024 * 1024
  ) {
    return fail("invalid-structure", path);
  }
  return value;
};

const id = (value: unknown, path: string): string => {
  const parsed = text(value, path);
  return parsed.length <= 512 ? parsed : fail("invalid-structure", path);
};

const bool = (value: unknown, path: string): boolean =>
  typeof value === "boolean" ? value : fail("invalid-structure", path);

const optionalNumber = (value: unknown, path: string): number | undefined =>
  value === undefined ? undefined : finiteNumber(value, path);

const enumValue = <T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): T =>
  typeof value === "string" && values.includes(value as T)
    ? (value as T)
    : fail("invalid-structure", path);

export const boundedArray = (
  value: unknown,
  path: string,
  maximum: number,
): unknown[] => {
  if (!Array.isArray(value)) return fail("invalid-structure", path);
  if (value.length > maximum) return fail("limit-exceeded", path);
  return value;
};

const dateText = (value: unknown, path: string): string => {
  const parsed = text(value, path);
  return Number.isFinite(Date.parse(parsed))
    ? parsed
    : fail("invalid-structure", path);
};

const vec2 = (value: unknown, path: string): Vec2 => {
  const data = record(value, path);
  return {
    x: finiteNumber(data.x, `${path}.x`),
    y: finiteNumber(data.y, `${path}.y`),
  };
};

const normalizedVec2 = (value: unknown, path: string): NormalizedVec2 => {
  const parsed = vec2(value, path);
  if (parsed.x < 0 || parsed.x > 1 || parsed.y < 0 || parsed.y > 1) {
    return fail("invalid-structure", path);
  }
  return parsed;
};

const normalizedPoints = (value: unknown, path: string): NormalizedVec2[] =>
  boundedArray(value, path, PROJECT_LIMITS.features).map((point, index) =>
    normalizedVec2(point, `${path}[${index}]`),
  );

const placement = (value: unknown, path: string): ImagePlacement => {
  const data = record(value, path);
  const cropData = record(data.crop, `${path}.crop`);
  const crop = {
    x: boundedNumber(cropData.x, `${path}.crop.x`, 0, 1),
    y: boundedNumber(cropData.y, `${path}.crop.y`, 0, 1),
    width: boundedNumber(cropData.width, `${path}.crop.width`, 0, 1),
    height: boundedNumber(cropData.height, `${path}.crop.height`, 0, 1),
  };
  if (
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > 1 ||
    crop.y + crop.height > 1
  ) {
    return fail("invalid-structure", `${path}.crop`);
  }
  const scale = finiteNumber(data.scale, `${path}.scale`);
  if (scale <= 0) return fail("invalid-structure", `${path}.scale`);
  return {
    mode: enumValue(data.mode, ["contain", "cover", "manual"], `${path}.mode`),
    crop,
    scale,
    rotationRad: finiteNumber(data.rotationRad, `${path}.rotationRad`),
    translate: vec2(data.translate, `${path}.translate`),
  };
};

const image = (
  value: unknown,
  path: string,
  masterDurationSec: number,
): ImageAsset => {
  const data = record(value, path);
  const sourceData = record(data.source, `${path}.source`);
  const kind = enumValue(
    sourceData.kind,
    ["data-url", "indexed-db", "bundled", "external-file-placeholder"],
    `${path}.source.kind`,
  );
  const sourceValue = sourceText(sourceData.value, `${path}.source.value`);
  if (kind === "data-url" && !sourceValue.startsWith("data:")) {
    return fail("invalid-structure", `${path}.source.value`);
  }
  let clip: ImageAsset["timeline"];
  if (data.timeline !== undefined) {
    const timeline = record(data.timeline, `${path}.timeline`);
    const startSec = boundedTime(
      timeline.startSec,
      `${path}.timeline.startSec`,
      0,
      masterDurationSec,
    );
    const durationSec = boundedTime(
      timeline.durationSec,
      `${path}.timeline.durationSec`,
      0.001,
      masterDurationSec,
    );
    if (startSec + durationSec > masterDurationSec + TIME_TOLERANCE_SEC) {
      return fail("invalid-structure", `${path}.timeline`);
    }
    clip = {
      startSec,
      durationSec: Math.min(durationSec, masterDurationSec - startSec),
    };
  }
  return {
    id: id(data.id, `${path}.id`),
    name: text(data.name, `${path}.name`),
    width: limitedInteger(
      data.width,
      `${path}.width`,
      1,
      PROJECT_LIMITS.logicalDimension,
    ),
    height: limitedInteger(
      data.height,
      `${path}.height`,
      1,
      PROJECT_LIMITS.logicalDimension,
    ),
    source: { kind, value: sourceValue },
    placement: placement(data.placement, `${path}.placement`),
    ...(clip ? { timeline: clip } : {}),
  };
};

const videoTimeline = (
  value: unknown,
  path: string,
  durationSec: number,
  masterDurationSec: number,
): VideoTimeline => {
  const data = record(value, path);
  const startSec = boundedTime(
    data.startSec,
    `${path}.startSec`,
    0,
    masterDurationSec,
  );
  const inSec = boundedTime(data.inSec, `${path}.inSec`, 0, durationSec);
  const parsedDurationSec = boundedTime(
    data.durationSec,
    `${path}.durationSec`,
    0,
    Math.min(durationSec, masterDurationSec),
  );
  const maxDurationSec = Math.min(
    durationSec - inSec,
    masterDurationSec - startSec,
  );
  if (parsedDurationSec > maxDurationSec + TIME_TOLERANCE_SEC) {
    return fail("invalid-structure", path);
  }
  return {
    startSec,
    inSec,
    durationSec: Math.min(parsedDurationSec, maxDurationSec),
  };
};

const video = (
  value: unknown,
  path: string,
  masterDurationSec: number,
): VideoAsset => {
  const data = record(value, path);
  const durationSec = limitedNumber(
    data.durationSec,
    `${path}.durationSec`,
    0.001,
    PROJECT_LIMITS.timelineDurationSec,
  );
  const sourceData = record(data.source, `${path}.source`);
  const sourceKind = enumValue(
    sourceData.kind,
    ["external-video-placeholder"],
    `${path}.source.kind`,
  );
  const fps = optionalNumber(data.fps, `${path}.fps`);
  if (fps !== undefined && fps <= 0) fail("invalid-structure", `${path}.fps`);
  return {
    id: id(data.id, `${path}.id`),
    name: text(data.name, `${path}.name`),
    width: limitedInteger(
      data.width,
      `${path}.width`,
      1,
      PROJECT_LIMITS.logicalDimension,
    ),
    height: limitedInteger(
      data.height,
      `${path}.height`,
      1,
      PROJECT_LIMITS.logicalDimension,
    ),
    durationSec,
    ...(fps === undefined ? {} : { fps }),
    ...(data.fingerprint === undefined
      ? {}
      : { fingerprint: text(data.fingerprint, `${path}.fingerprint`) }),
    source: {
      kind: sourceKind,
      value: text(sourceData.value, `${path}.source.value`),
    },
    timeline: videoTimeline(
      data.timeline,
      `${path}.timeline`,
      durationSec,
      masterDurationSec,
    ),
  };
};

const videos = (
  value: unknown,
  path: string,
  masterDurationSec: number,
): ProjectVideos | undefined => {
  if (value === undefined) return undefined;
  const data = record(value, path);
  return {
    ...(data.source === undefined
      ? {}
      : { source: video(data.source, `${path}.source`, masterDurationSec) }),
    ...(data.target === undefined
      ? {}
      : { target: video(data.target, `${path}.target`, masterDurationSec) }),
  };
};

type ParseBudget = { keyframes: number };
type TrackDurations = { a: number; b: number };

const takeKeyframes = (
  value: unknown,
  path: string,
  budget: ParseBudget,
): unknown[] => {
  const frames = boundedArray(value, path, PROJECT_LIMITS.keyframes);
  budget.keyframes += frames.length;
  if (budget.keyframes > PROJECT_LIMITS.keyframes) {
    return fail("limit-exceeded", path);
  }
  return frames;
};

const timedPoints = (
  value: unknown,
  path: string,
  timelineDurationSec: number,
  budget: ParseBudget,
) =>
  takeKeyframes(value, path, budget).map((frame, index) => {
    const framePath = `${path}[${index}]`;
    const data = record(frame, framePath);
    return {
      timeSec: boundedTime(
        data.timeSec,
        `${framePath}.timeSec`,
        0,
        timelineDurationSec,
      ),
      pos: normalizedVec2(data.pos, `${framePath}.pos`),
    };
  });

const timedPointArrays = (
  value: unknown,
  path: string,
  timelineDurationSec: number,
  budget: ParseBudget,
) =>
  takeKeyframes(value, path, budget).map((frame, index) => {
    const framePath = `${path}[${index}]`;
    const data = record(frame, framePath);
    return {
      timeSec: boundedTime(
        data.timeSec,
        `${framePath}.timeSec`,
        0,
        timelineDurationSec,
      ),
      points: normalizedPoints(data.points, `${framePath}.points`),
    };
  });

const pointTracks = (
  value: unknown,
  path: string,
  trackDurations: TrackDurations,
  budget: ParseBudget,
) => {
  if (value === undefined) return undefined;
  const data = record(value, path);
  return {
    ...(data.a === undefined
      ? {}
      : { a: timedPoints(data.a, `${path}.a`, trackDurations.a, budget) }),
    ...(data.b === undefined
      ? {}
      : { b: timedPoints(data.b, `${path}.b`, trackDurations.b, budget) }),
  };
};

const segmentTracks = (
  value: unknown,
  path: string,
  trackDurations: TrackDurations,
  budget: ParseBudget,
) => {
  if (value === undefined) return undefined;
  const data = record(value, path);
  return Object.fromEntries(
    (["a0", "a1", "b0", "b1"] as const)
      .filter((key) => data[key] !== undefined)
      .map((key) => [
        key,
        timedPoints(
          data[key],
          `${path}.${key}`,
          trackDurations[key.startsWith("a") ? "a" : "b"],
          budget,
        ),
      ]),
  );
};

const polylineTracks = (
  value: unknown,
  path: string,
  trackDurations: TrackDurations,
  budget: ParseBudget,
) => {
  if (value === undefined) return undefined;
  const data = record(value, path);
  return {
    ...(data.a === undefined
      ? {}
      : {
          a: timedPointArrays(data.a, `${path}.a`, trackDurations.a, budget),
        }),
    ...(data.b === undefined
      ? {}
      : {
          b: timedPointArrays(data.b, `${path}.b`, trackDurations.b, budget),
        }),
  };
};

const featureBase = (data: RecordValue, path: string): FeatureBase => ({
  id: id(data.id, `${path}.id`),
  ...(data.label === undefined
    ? {}
    : { label: text(data.label, `${path}.label`, true) }),
  enabled: bool(data.enabled, `${path}.enabled`),
  ...(data.locked === undefined
    ? {}
    : { locked: bool(data.locked, `${path}.locked`) }),
  ...(data.layerId === undefined
    ? {}
    : { layerId: id(data.layerId, `${path}.layerId`) }),
  ...(data.weight === undefined
    ? {}
    : { weight: boundedNumber(data.weight, `${path}.weight`, 0, 1_000_000) }),
  createdAt: dateText(data.createdAt, `${path}.createdAt`),
  updatedAt: dateText(data.updatedAt, `${path}.updatedAt`),
});

const feature = (
  value: unknown,
  path: string,
  trackDurations: TrackDurations,
  budget: ParseBudget,
): FeaturePair => {
  const data = record(value, path);
  const base = featureBase(data, path);
  const kind = enumValue(
    data.kind,
    ["point", "segment", "polyline", "region"],
    `${path}.kind`,
  );
  switch (kind) {
    case "point":
      return {
        ...base,
        kind,
        a: normalizedVec2(data.a, `${path}.a`),
        b: normalizedVec2(data.b, `${path}.b`),
        ...(data.tracks === undefined
          ? {}
          : {
              tracks: pointTracks(
                data.tracks,
                `${path}.tracks`,
                trackDurations,
                budget,
              ),
            }),
        ...(data.semantic === undefined
          ? {}
          : {
              semantic: enumValue(
                data.semantic,
                [
                  "left-eye",
                  "right-eye",
                  "nose",
                  "mouth",
                  "chin",
                  "jaw",
                  "hairline",
                  "custom",
                ] as const,
                `${path}.semantic`,
              ),
            }),
      };
    case "segment":
      return {
        ...base,
        kind,
        a0: normalizedVec2(data.a0, `${path}.a0`),
        a1: normalizedVec2(data.a1, `${path}.a1`),
        b0: normalizedVec2(data.b0, `${path}.b0`),
        b1: normalizedVec2(data.b1, `${path}.b1`),
        ...(data.tracks === undefined
          ? {}
          : {
              tracks: segmentTracks(
                data.tracks,
                `${path}.tracks`,
                trackDurations,
                budget,
              ),
            }),
        ...(data.falloff === undefined
          ? {}
          : {
              falloff: boundedNumber(
                data.falloff,
                `${path}.falloff`,
                0,
                1_000_000,
              ),
            }),
      };
    case "polyline":
      return {
        ...base,
        kind,
        a: normalizedPoints(data.a, `${path}.a`),
        b: normalizedPoints(data.b, `${path}.b`),
        ...(data.tracks === undefined
          ? {}
          : {
              tracks: polylineTracks(
                data.tracks,
                `${path}.tracks`,
                trackDurations,
                budget,
              ),
            }),
        ...(data.closed === undefined
          ? {}
          : { closed: bool(data.closed, `${path}.closed`) }),
        ...(data.smooth === undefined
          ? {}
          : { smooth: bool(data.smooth, `${path}.smooth`) }),
        ...(data.sampleCount === undefined
          ? {}
          : {
              sampleCount: limitedInteger(
                data.sampleCount,
                `${path}.sampleCount`,
                1,
                PROJECT_LIMITS.features,
              ),
            }),
        ...(data.falloff === undefined
          ? {}
          : {
              falloff: boundedNumber(
                data.falloff,
                `${path}.falloff`,
                0,
                1_000_000,
              ),
            }),
      };
    case "region":
      return {
        ...base,
        kind,
        a: normalizedPoints(data.a, `${path}.a`),
        b: normalizedPoints(data.b, `${path}.b`),
        ...(data.tracks === undefined
          ? {}
          : {
              tracks: polylineTracks(
                data.tracks,
                `${path}.tracks`,
                trackDurations,
                budget,
              ),
            }),
        ...(data.smooth === undefined
          ? {}
          : { smooth: bool(data.smooth, `${path}.smooth`) }),
        ...(data.role === undefined
          ? {}
          : {
              role: enumValue(
                data.role,
                [
                  "face",
                  "hair",
                  "neck",
                  "body",
                  "background",
                  "custom",
                ] as const,
                `${path}.role`,
              ),
            }),
        feather: boundedNumber(data.feather, `${path}.feather`, 0, 1),
      };
  }
};

/** One of the five named curves, or a bounded `cubic-bezier` object (M24). */
const easing = (value: unknown, path: string): Easing => {
  if (typeof value === "object" && value !== null) {
    const data = record(value, path);
    if (data.kind !== "bezier") fail("invalid-structure", `${path}.kind`);
    return {
      kind: "bezier",
      x1: boundedNumber(data.x1, `${path}.x1`, 0, 1),
      y1: boundedNumber(data.y1, `${path}.y1`, 0, 1),
      x2: boundedNumber(data.x2, `${path}.x2`, 0, 1),
      y2: boundedNumber(data.y2, `${path}.y2`, 0, 1),
    };
  }
  return enumValue(value, NAMED_EASINGS, path);
};

const layerTiming = (value: unknown, path: string): LayerTiming => {
  const data = record(value, path);
  return {
    warpStart: boundedNumber(data.warpStart, `${path}.warpStart`, 0, 1),
    warpEnd: boundedNumber(data.warpEnd, `${path}.warpEnd`, 0, 1),
    dissolveStart: boundedNumber(
      data.dissolveStart,
      `${path}.dissolveStart`,
      0,
      1,
    ),
    dissolveEnd: boundedNumber(data.dissolveEnd, `${path}.dissolveEnd`, 0, 1),
    easing: easing(data.easing, `${path}.easing`),
    ...(data.dissolveEasing === undefined
      ? {}
      : {
          dissolveEasing: easing(data.dissolveEasing, `${path}.dissolveEasing`),
        }),
  };
};

const validateMaskData = (
  data: string,
  decodedLength: number,
  path: string,
): void => {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data,
    )
  ) {
    fail("invalid-mask", path);
  }
  const maximumPackedBytes = decodedLength * 2;
  if (data.length > Math.ceil(maximumPackedBytes / 3) * 4) {
    fail("invalid-mask", path);
  }
  let packed: string;
  try {
    packed = atob(data);
  } catch {
    return fail("invalid-mask", path);
  }
  if (packed.length % 2 !== 0 || packed.length > maximumPackedBytes) {
    fail("invalid-mask", path);
  }
  let total = 0;
  for (let index = 0; index < packed.length; index += 2) {
    const run = packed.charCodeAt(index);
    if (run === 0 || total + run > decodedLength) fail("invalid-mask", path);
    total += run;
  }
  if (total !== decodedLength) fail("invalid-mask", path);
};

const paintedMask = (value: unknown, path: string): PaintedMask => {
  const data = record(value, path);
  const width = limitedInteger(
    data.width,
    `${path}.width`,
    1,
    PROJECT_LIMITS.paintedMaskEdge,
  );
  const height = limitedInteger(
    data.height,
    `${path}.height`,
    1,
    PROJECT_LIMITS.paintedMaskEdge,
  );
  const decodedLength = width * height;
  if (decodedLength > PROJECT_LIMITS.paintedMaskBytes) {
    return fail("limit-exceeded", path);
  }
  const encoded =
    typeof data.data === "string"
      ? data.data
      : fail("invalid-structure", `${path}.data`);
  validateMaskData(encoded, decodedLength, `${path}.data`);
  return { width, height, data: encoded };
};

const algorithm = (value: unknown, path: string): MorphAlgorithmId =>
  enumValue(
    value,
    ["crossfade", "mesh", "thin-plate-spline", "beier-neely"],
    path,
  );

const layer = (
  value: unknown,
  path: string,
  timelineDurationSec: number,
): MorphLayer => {
  const data = record(value, path);
  const featureIds =
    data.featureIds === "all"
      ? "all"
      : boundedArray(
          data.featureIds,
          `${path}.featureIds`,
          PROJECT_LIMITS.features,
        ).map((value, index) => id(value, `${path}.featureIds[${index}]`));
  let mask: MorphLayer["mask"];
  if (data.mask !== undefined) {
    const maskData = record(data.mask, `${path}.mask`);
    mask = {
      featureId: id(maskData.featureId, `${path}.mask.featureId`),
      mode: enumValue(
        maskData.mode,
        ["hard", "feathered"],
        `${path}.mask.mode`,
      ),
      feather: boundedNumber(maskData.feather, `${path}.mask.feather`, 0, 1),
      ...(maskData.invert === undefined
        ? {}
        : { invert: bool(maskData.invert, `${path}.mask.invert`) }),
    };
  }
  let clip: MorphLayer["clip"];
  /** Pre-M24 files carried the acting easing on the clip; it now lives on timing. */
  let legacyClipEasing: LayerTiming["easing"] | undefined;
  if (data.clip !== undefined) {
    const clipData = record(data.clip, `${path}.clip`);
    clip = {
      startSec: boundedTime(
        clipData.startSec,
        `${path}.clip.startSec`,
        0,
        timelineDurationSec,
      ),
      durationSec: boundedTime(
        clipData.durationSec,
        `${path}.clip.durationSec`,
        0.001,
        timelineDurationSec,
      ),
    };
    if (clipData.easing !== undefined) {
      legacyClipEasing = easing(clipData.easing, `${path}.clip.easing`);
    }
    const maxDurationSec = timelineDurationSec - clip.startSec;
    if (clip.durationSec > maxDurationSec + TIME_TOLERANCE_SEC) {
      fail("invalid-structure", `${path}.clip`);
    }
    clip.durationSec = Math.min(clip.durationSec, maxDurationSec);
  }
  const timing = layerTiming(data.timing, `${path}.timing`);
  if (legacyClipEasing !== undefined) timing.easing = legacyClipEasing;
  return {
    id: id(data.id, `${path}.id`),
    name: text(data.name, `${path}.name`),
    enabled: bool(data.enabled, `${path}.enabled`),
    visible: bool(data.visible, `${path}.visible`),
    locked: bool(data.locked, `${path}.locked`),
    zIndex: integer(data.zIndex, `${path}.zIndex`, -1_000_000, 1_000_000),
    featureIds,
    ...(mask === undefined ? {} : { mask }),
    ...(data.paintedMask === undefined
      ? {}
      : { paintedMask: paintedMask(data.paintedMask, `${path}.paintedMask`) }),
    ...(data.algorithmOverride === undefined
      ? {}
      : {
          algorithmOverride: algorithm(
            data.algorithmOverride,
            `${path}.algorithmOverride`,
          ),
        }),
    opacity: boundedNumber(data.opacity, `${path}.opacity`, 0, 1),
    compositeMode: enumValue(
      data.compositeMode,
      ["source-over", "normal", "screen", "multiply", "lighter"],
      `${path}.compositeMode`,
    ),
    timing,
    ...(clip === undefined ? {} : { clip }),
  };
};

const settings = (value: unknown, path: string): AlgorithmSettings => {
  const data = record(value, path);
  const crossfade = record(data.crossfade, `${path}.crossfade`);
  const mesh = record(data.mesh, `${path}.mesh`);
  const tps = record(data.thinPlateSpline, `${path}.thinPlateSpline`);
  const beier = record(data.beierNeely, `${path}.beierNeely`);
  return {
    crossfade: {
      gammaCorrectBlend: bool(
        crossfade.gammaCorrectBlend,
        `${path}.crossfade.gammaCorrectBlend`,
      ),
    },
    mesh: {
      borderAnchors: bool(mesh.borderAnchors, `${path}.mesh.borderAnchors`),
      borderAnchorCount: integer(
        mesh.borderAnchorCount,
        `${path}.mesh.borderAnchorCount`,
        0,
        1_024,
      ),
      showWireframe: bool(mesh.showWireframe, `${path}.mesh.showWireframe`),
    },
    thinPlateSpline: {
      lambda: boundedNumber(
        tps.lambda,
        `${path}.thinPlateSpline.lambda`,
        0,
        1_000_000,
      ),
      borderAnchors: bool(
        tps.borderAnchors,
        `${path}.thinPlateSpline.borderAnchors`,
      ),
      borderAnchorCount: integer(
        tps.borderAnchorCount,
        `${path}.thinPlateSpline.borderAnchorCount`,
        0,
        1_024,
      ),
      samplePolylines: bool(
        tps.samplePolylines,
        `${path}.thinPlateSpline.samplePolylines`,
      ),
      polylineSampleSpacing: boundedNumber(
        tps.polylineSampleSpacing,
        `${path}.thinPlateSpline.polylineSampleSpacing`,
        Number.EPSILON,
        1,
      ),
      showGrid: bool(tps.showGrid, `${path}.thinPlateSpline.showGrid`),
    },
    beierNeely: {
      a: boundedNumber(
        beier.a,
        `${path}.beierNeely.a`,
        Number.EPSILON,
        1_000_000,
      ),
      b: boundedNumber(beier.b, `${path}.beierNeely.b`, 0, 1_000_000),
      p: boundedNumber(beier.p, `${path}.beierNeely.p`, 0, 1_000_000),
      maxLines: limitedInteger(
        beier.maxLines,
        `${path}.beierNeely.maxLines`,
        1,
        PROJECT_LIMITS.features,
      ),
      samplePolylines: bool(
        beier.samplePolylines,
        `${path}.beierNeely.samplePolylines`,
      ),
    },
  };
};

const timeline = (value: unknown, path: string): TimelineSettings => {
  const data = record(value, path);
  return {
    durationSec: limitedNumber(
      data.durationSec,
      `${path}.durationSec`,
      0.001,
      PROJECT_LIMITS.timelineDurationSec,
    ),
    fps: boundedNumber(data.fps, `${path}.fps`, Number.EPSILON, 1_000),
    loop: bool(data.loop, `${path}.loop`),
    pingPong: bool(data.pingPong, `${path}.pingPong`),
  };
};

const canvas = (value: unknown, path: string): CanvasSettings => {
  const data = record(value, path);
  return {
    aspectRatio: enumValue(
      data.aspectRatio,
      ["1:1", "4:3", "16:9", "custom"],
      `${path}.aspectRatio`,
    ),
    width: limitedInteger(
      data.width,
      `${path}.width`,
      1,
      PROJECT_LIMITS.logicalDimension,
    ),
    height: limitedInteger(
      data.height,
      `${path}.height`,
      1,
      PROJECT_LIMITS.logicalDimension,
    ),
    background: enumValue(
      data.background,
      ["transparent", "checkerboard", "black", "white"],
      `${path}.background`,
    ),
  };
};

const validateReferences = (project: MorphProject): void => {
  const layerIds = new Set<string>();
  for (const layer of project.layers) {
    if (layerIds.has(layer.id)) fail("invalid-reference", "layers.id");
    layerIds.add(layer.id);
  }
  if (!layerIds.has(GLOBAL_LAYER_ID))
    fail("invalid-reference", "layers.global");

  const features = new Map<string, FeaturePair>();
  for (const feature of project.features) {
    if (features.has(feature.id)) fail("invalid-reference", "features.id");
    features.set(feature.id, feature);
    if (feature.layerId !== undefined && !layerIds.has(feature.layerId)) {
      fail("invalid-reference", `features.${feature.id}.layerId`);
    }
  }
  for (const layer of project.layers) {
    if (layer.featureIds !== "all") {
      for (const featureId of layer.featureIds) {
        if (!features.has(featureId)) {
          fail("invalid-reference", `layers.${layer.id}.featureIds`);
        }
      }
    }
    if (layer.mask !== undefined) {
      const feature = features.get(layer.mask.featureId);
      if (feature?.kind !== "region") {
        fail("invalid-reference", `layers.${layer.id}.mask.featureId`);
      }
    }
  }
  if (
    project.ui?.selectedLayerId !== undefined &&
    !layerIds.has(project.ui.selectedLayerId)
  ) {
    fail("invalid-reference", "ui.selectedLayerId");
  }
  for (const selectedId of project.ui?.selectedFeatureIds ?? []) {
    if (!features.has(selectedId))
      fail("invalid-reference", "ui.selectedFeatureIds");
  }
};

/** Parses a validated v1 document and constructs a fresh project object. */
export function parseProjectV1(value: unknown): MorphProject {
  const data = record(value, "project");
  if (data.version !== 1) return fail("unsupported-version", "version");

  const parsedTimeline = timeline(data.timeline, "timeline");
  const imagesData = record(data.images, "images");
  const parsedVideos =
    data.videos === undefined
      ? undefined
      : videos(data.videos, "videos", parsedTimeline.durationSec);
  // Video tracks use source-media time, including the trimmed-in portion.
  // Still-image tracks use master time, as in videoLocalTimeSec.
  const trackDurations = {
    a: parsedVideos?.source?.durationSec ?? parsedTimeline.durationSec,
    b: parsedVideos?.target?.durationSec ?? parsedTimeline.durationSec,
  };
  const budget: ParseBudget = { keyframes: 0 };
  const parsedFeatures = boundedArray(
    data.features,
    "features",
    PROJECT_LIMITS.features,
  ).map((entry, index) =>
    feature(entry, `features[${index}]`, trackDurations, budget),
  );
  const parsedLayers =
    data.layers === undefined
      ? [
          {
            ...defaultGlobalLayer(),
            clip: defaultLayerClip(parsedTimeline.durationSec),
          },
        ]
      : boundedArray(data.layers, "layers", PROJECT_LIMITS.layers).map(
          (entry, index) =>
            layer(entry, `layers[${index}]`, parsedTimeline.durationSec),
        );
  if (parsedLayers.length === 0) fail("invalid-structure", "layers");

  let ui: MorphProject["ui"];
  if (data.ui !== undefined) {
    const uiData = record(data.ui, "ui");
    ui = {
      selectedFeatureIds: boundedArray(
        uiData.selectedFeatureIds,
        "ui.selectedFeatureIds",
        PROJECT_LIMITS.features,
      ).map((value, index) => id(value, `ui.selectedFeatureIds[${index}]`)),
      ...(uiData.selectedLayerId === undefined
        ? {}
        : {
            selectedLayerId: id(uiData.selectedLayerId, "ui.selectedLayerId"),
          }),
      zoom: boundedNumber(uiData.zoom, "ui.zoom", Number.EPSILON, 1_000_000),
      pan: vec2(uiData.pan, "ui.pan"),
    };
  }

  const project: MorphProject = {
    version: 1,
    id: id(data.id, "id"),
    name: text(data.name, "name", true),
    createdAt: dateText(data.createdAt, "createdAt"),
    updatedAt: dateText(data.updatedAt, "updatedAt"),
    canvas: canvas(data.canvas, "canvas"),
    images: {
      source: image(
        imagesData.source,
        "images.source",
        parsedTimeline.durationSec,
      ),
      target: image(
        imagesData.target,
        "images.target",
        parsedTimeline.durationSec,
      ),
    },
    ...(parsedVideos === undefined ? {} : { videos: parsedVideos }),
    features: parsedFeatures,
    layers: parsedLayers.map((entry) => ({
      ...entry,
      clip: entry.clip ?? defaultLayerClip(parsedTimeline.durationSec),
    })),
    timeline: parsedTimeline,
    activeAlgorithm: algorithm(data.activeAlgorithm, "activeAlgorithm"),
    algorithmSettings: settings(data.algorithmSettings, "algorithmSettings"),
    ...(ui === undefined ? {} : { ui }),
  };
  validateReferences(project);
  return project;
}
