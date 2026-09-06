import type { VideoCodec } from "mediabunny";
import type { ExportSettings } from "@/morph/model";
import { ExportError } from "./exportValidation";

/**
 * H.264 levels (level_idc, max frame size in macroblocks, max macroblocks/sec),
 * ascending. Used to pick the smallest level that fits a given resolution + fps,
 * because the codec string's level must cover the frame size or the browser's
 * encoder reports the config as unsupported (e.g. level 3.0 maxes out near SD,
 * so 720p/1080p need 3.1/4.0).
 */
const AVC_LEVELS: { idc: number; maxFs: number; maxMbps: number }[] = [
  { idc: 0x1e, maxFs: 1620, maxMbps: 40500 }, // 3.0
  { idc: 0x1f, maxFs: 3600, maxMbps: 108000 }, // 3.1
  { idc: 0x20, maxFs: 5120, maxMbps: 216000 }, // 3.2
  { idc: 0x28, maxFs: 8192, maxMbps: 245760 }, // 4.0
  { idc: 0x2a, maxFs: 8704, maxMbps: 522240 }, // 4.2
  { idc: 0x32, maxFs: 22080, maxMbps: 589824 }, // 5.0
  { idc: 0x33, maxFs: 36864, maxMbps: 983040 }, // 5.1
  { idc: 0x34, maxFs: 36864, maxMbps: 2073600 }, // 5.2
];

function avcLevelIdc(width: number, height: number, fps: number): number {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = mbs * fps;
  const level =
    AVC_LEVELS.find((l) => l.maxFs >= mbs && l.maxMbps >= mbps) ??
    AVC_LEVELS[AVC_LEVELS.length - 1];
  return level.idc;
}

/**
 * Resolves the codec string actually fed to the encoder. For H.264 the level is
 * recomputed from the export resolution + fps (the stored default declares a low
 * level that only covers SD); profile and constraint flags are preserved. VP9 /
 * AV1 strings are returned unchanged.
 */
export function resolveExportCodec(settings: ExportSettings): string {
  if (!settings.codec.startsWith("avc1")) return settings.codec;
  const idc = avcLevelIdc(settings.width, settings.height, settings.fps);
  const levelHex = idc.toString(16).padStart(2, "0").toUpperCase();
  // Keep "avc1.<profile><constraints>" and replace the trailing level byte.
  return settings.codec.slice(0, 9) + levelHex;
}

/**
 * Validates the export config against the browser's encoder (PRD §12.3) using
 * `VideoEncoder.isConfigSupported`. Returns the (possibly normalized) config to
 * feed straight into `VideoEncoder.configure`. Throws a localized
 * codec-unsupported error (with the resolved codec string appended) when the
 * codec can't be encoded here.
 */
export async function getSupportedVideoConfig(
  settings: ExportSettings,
): Promise<VideoEncoderConfig> {
  const codec = resolveExportCodec(settings);
  const config: VideoEncoderConfig = {
    codec,
    width: settings.width,
    height: settings.height,
    bitrate: settings.bitrate,
    framerate: settings.fps,
  };

  let support: VideoEncoderSupport;
  try {
    support = await VideoEncoder.isConfigSupported(config);
  } catch (err) {
    throw new ExportError("unsupported-codec", { cause: err });
  }

  if (!support.supported) {
    throw new ExportError("unsupported-codec");
  }

  return support.config ?? config;
}

/**
 * Maps a WebCodecs codec string to the Mediabunny {@link VideoCodec} family
 * used by its muxer. Mediabunny keys the container track by codec family, while
 * WebCodecs needs the full profile string.
 */
export function toMediabunnyCodec(codec: ExportSettings["codec"]): VideoCodec {
  if (codec.startsWith("vp09")) return "vp9";
  if (codec.startsWith("av01")) return "av1";
  return "avc";
}
