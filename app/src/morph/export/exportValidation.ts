import type { ExportSettings, MorphProject } from "@/morph/model";
import {
  resolveExportDimensions,
  type ExportDimensions,
} from "./exportDimensions";

export const EXPORT_LIMITS = {
  minWidth: 16,
  maxWidth: 3_840,
  minHeight: 16,
  maxHeight: 2_160,
  minFps: 12,
  maxFps: 60,
  minDurationSec: 1,
  maxDurationSec: 15,
  maxFrames: 900,
  minBitrate: 1_000_000,
  maxBitrate: 20_000_000,
  maxSequencePixelFrames: 300_000_000,
} as const;

export type ExportErrorCode =
  | "unsupported-webgpu"
  | "unsupported-webcodecs"
  | "unsupported-codec"
  | "invalid-dimensions"
  | "device-dimension-limit"
  | "invalid-fps"
  | "invalid-duration"
  | "too-many-frames"
  | "invalid-bitrate"
  | "sequence-too-large"
  | "media-missing"
  | "cancelled"
  | "gpu-failure";

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = "ExportError";
    this.code = code;
  }
}

export type ExportValidationOptions = {
  dimensions?: ExportDimensions;
  deviceLimits?: Pick<GPUSupportedLimits, "maxTextureDimension2D">;
};

export type ValidatedExportJob = {
  dimensions: ExportDimensions;
  durationSec: number;
  frameCount: number;
  sequencePixelFrames: number;
};

const finite = (value: number): boolean => Number.isFinite(value);

/**
 * Video-backed projects keep source-time speed for the selected timeline
 * range. Ping-pong changes sampling direction within that same output duration
 * (it does not silently double the requested clip).
 */
export function effectiveExportDuration(
  project: MorphProject,
  settings: ExportSettings,
): number {
  const usesVideo = Boolean(project.videos?.source || project.videos?.target);
  return usesVideo
    ? project.timeline.durationSec * Math.abs(settings.endT - settings.startT)
    : settings.durationSec;
}

export function validatedFrameCount(durationSec: number, fps: number): number {
  return Math.max(2, Math.round(durationSec * fps));
}

export function validateExportJob(
  project: MorphProject,
  settings: ExportSettings,
  options: ExportValidationOptions = {},
): ValidatedExportJob {
  const requestedDimensions = (() => {
    switch (settings.resolutionPreset) {
      case "project":
        return { width: project.canvas.width, height: project.canvas.height };
      case "source":
        return {
          width: project.images.source.width,
          height: project.images.source.height,
        };
      case "target":
        return {
          width: project.images.target.width,
          height: project.images.target.height,
        };
      case "custom":
        return { width: settings.width, height: settings.height };
    }
  })();
  const dimensions =
    options.dimensions ?? resolveExportDimensions(project, settings);
  for (const candidate of [requestedDimensions, dimensions]) {
    const { width, height } = candidate;
    if (
      !finite(width) ||
      !finite(height) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < EXPORT_LIMITS.minWidth ||
      width > EXPORT_LIMITS.maxWidth ||
      height < EXPORT_LIMITS.minHeight ||
      height > EXPORT_LIMITS.maxHeight
    ) {
      throw new ExportError("invalid-dimensions");
    }
  }

  const { width, height } = dimensions;

  const deviceMaximum = options.deviceLimits?.maxTextureDimension2D;
  if (
    deviceMaximum !== undefined &&
    (!finite(deviceMaximum) ||
      deviceMaximum <= 0 ||
      width > deviceMaximum ||
      height > deviceMaximum)
  ) {
    throw new ExportError("device-dimension-limit");
  }

  if (
    !finite(settings.startT) ||
    !finite(settings.endT) ||
    settings.startT < 0 ||
    settings.startT > 1 ||
    settings.endT < 0 ||
    settings.endT > 1
  ) {
    throw new ExportError("invalid-duration");
  }
  if (
    !finite(settings.fps) ||
    settings.fps < EXPORT_LIMITS.minFps ||
    settings.fps > EXPORT_LIMITS.maxFps
  ) {
    throw new ExportError("invalid-fps");
  }

  const durationSec = effectiveExportDuration(project, settings);
  if (
    !finite(durationSec) ||
    durationSec < EXPORT_LIMITS.minDurationSec ||
    durationSec > EXPORT_LIMITS.maxDurationSec
  ) {
    throw new ExportError("invalid-duration");
  }
  const frameCount = validatedFrameCount(durationSec, settings.fps);
  if (frameCount > EXPORT_LIMITS.maxFrames) {
    throw new ExportError("too-many-frames");
  }

  if (
    !finite(settings.bitrate) ||
    settings.bitrate < EXPORT_LIMITS.minBitrate ||
    settings.bitrate > EXPORT_LIMITS.maxBitrate
  ) {
    throw new ExportError("invalid-bitrate");
  }

  const sequencePixelFrames = width * height * frameCount;
  if (
    settings.outputKind === "frames" &&
    sequencePixelFrames > EXPORT_LIMITS.maxSequencePixelFrames
  ) {
    throw new ExportError("sequence-too-large");
  }

  return { dimensions, durationSec, frameCount, sequencePixelFrames };
}

export function throwIfExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportError("cancelled");
}

export function normalizeExportError(
  error: unknown,
  signal?: AbortSignal,
): ExportError {
  if (signal?.aborted) return new ExportError("cancelled", { cause: error });
  return error instanceof ExportError
    ? error
    : new ExportError("gpu-failure", { cause: error });
}
