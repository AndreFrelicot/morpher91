import type { ExportSettings, MorphProject } from "@/morph/model";

export type ExportDimensions = {
  width: number;
  height: number;
};

export type ExportImageDimensions = {
  source?: ExportDimensions;
  target?: ExportDimensions;
};

const normalizeDimension = (value: number): number =>
  Math.max(16, Math.round(Number.isFinite(value) ? value : 16));

const dimensionsFor = (fallback: ExportDimensions): ExportDimensions => ({
  width: normalizeDimension(fallback.width),
  height: normalizeDimension(fallback.height),
});

/**
 * Rounds width/height down to even numbers. H.264 (avc1) via VideoToolbox on
 * iOS — and most hardware encoders — reject odd dimensions, so the video export
 * path clamps here (M12 lot 5). Frame/PNG export keeps native odd sizes.
 */
export function toEvenDimensions(d: ExportDimensions): ExportDimensions {
  const even = (v: number) => Math.max(2, v - (v % 2));
  return { width: even(d.width), height: even(d.height) };
}

export function resolveExportDimensions(
  project: MorphProject,
  settings: ExportSettings,
  images: ExportImageDimensions = {},
): ExportDimensions {
  switch (settings.resolutionPreset) {
    case "project":
      return {
        width: normalizeDimension(project.canvas.width),
        height: normalizeDimension(project.canvas.height),
      };
    case "source":
      return dimensionsFor(images.source ?? project.images.source);
    case "target":
      return dimensionsFor(images.target ?? project.images.target);
    case "custom":
      return {
        width: normalizeDimension(settings.width),
        height: normalizeDimension(settings.height),
      };
  }
}
