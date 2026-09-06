/** Final export settings (PRD §12.2). Plain serializable data. */
export type ExportOutputKind = "video" | "frames";
export type FrameImageFormat = "png";
export type ExportResolutionPreset = "project" | "source" | "target" | "custom";
export type RenderBackground = "transparent" | "black" | "white";

export type ExportSettings = {
  width: number;
  height: number;
  resolutionPreset: ExportResolutionPreset;

  durationSec: number;
  fps: number;

  outputKind: ExportOutputKind;

  codec: "avc1.42E01E" | "vp09.00.10.08" | "av01.0.05M.08";
  container: "mp4" | "webm";

  bitrate: number;

  frameFormat: FrameImageFormat;
  includeManifest: boolean;

  /** Sub-range of the timeline to render, both in [0, 1]. */
  startT: number;
  endT: number;

  /** Play forward then backward within the duration (A→B→A). */
  includePingPong: boolean;
  background: RenderBackground;
};

export function normalizeBackgroundForOutput(
  outputKind: ExportOutputKind,
  background: RenderBackground,
): RenderBackground {
  return outputKind === "video" && background === "transparent"
    ? "black"
    : background;
}

/** PRD §12.2 defaults: 720p / 30 fps / 4 s, H.264 in MP4, 5 Mbps, black. */
export const defaultExportSettings: ExportSettings = {
  width: 1280,
  height: 720,
  resolutionPreset: "custom",
  durationSec: 4,
  fps: 30,
  outputKind: "video",
  codec: "avc1.42E01E",
  container: "mp4",
  bitrate: 5_000_000,
  frameFormat: "png",
  includeManifest: true,
  startT: 0,
  endT: 1,
  includePingPong: false,
  background: "black",
};
