import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultExportSettings, type ExportSettings } from "@/morph/model";
import {
  getSupportedVideoConfig,
  resolveExportCodec,
  toMediabunnyCodec,
} from "./codecSupport";

const settings = (patch: Partial<ExportSettings> = {}): ExportSettings => ({
  ...defaultExportSettings,
  ...patch,
});

const setEncoder = (
  isConfigSupported: (c: VideoEncoderConfig) => Promise<VideoEncoderSupport>,
) => {
  (globalThis as { VideoEncoder?: unknown }).VideoEncoder = {
    isConfigSupported,
  };
};

afterEach(() => {
  delete (globalThis as { VideoEncoder?: unknown }).VideoEncoder;
  vi.restoreAllMocks();
});

describe("resolveExportCodec", () => {
  it("picks the AVC level that fits the resolution", () => {
    // SD fits level 3.0, 720p needs 3.1, 1080p needs 4.0.
    expect(resolveExportCodec(settings({ width: 640, height: 480 }))).toBe(
      "avc1.42E01E",
    );
    expect(resolveExportCodec(settings({ width: 1280, height: 720 }))).toBe(
      "avc1.42E01F",
    );
    expect(resolveExportCodec(settings({ width: 1920, height: 1080 }))).toBe(
      "avc1.42E028",
    );
  });

  it("leaves non-AVC codecs untouched", () => {
    expect(
      resolveExportCodec(
        settings({ codec: "vp09.00.10.08", container: "webm" }),
      ),
    ).toBe("vp09.00.10.08");
    expect(resolveExportCodec(settings({ codec: "av01.0.05M.08" }))).toBe(
      "av01.0.05M.08",
    );
  });
});

describe("getSupportedVideoConfig", () => {
  it("returns the normalized config when supported", async () => {
    const normalized: VideoEncoderConfig = {
      codec: "avc1.42E01F",
      width: 1280,
      height: 720,
    };
    setEncoder(async (c) => ({
      supported: true,
      config: { ...c, ...normalized },
    }));

    const config = await getSupportedVideoConfig(defaultExportSettings);
    expect(config.width).toBe(1280);
    expect(config.height).toBe(720);
  });

  it("encodes 720p with a level the encoder accepts (>= 3.1)", async () => {
    let seen = "";
    setEncoder(async (c) => {
      seen = c.codec;
      return { supported: true } as VideoEncoderSupport;
    });
    await getSupportedVideoConfig(defaultExportSettings);
    expect(seen).toBe("avc1.42E01F");
  });

  it("falls back to the requested config when none is echoed", async () => {
    setEncoder(async () => ({ supported: true }) as VideoEncoderSupport);
    const config = await getSupportedVideoConfig(defaultExportSettings);
    expect(config.bitrate).toBe(defaultExportSettings.bitrate);
    expect(config.framerate).toBe(defaultExportSettings.fps);
  });

  it("throws a stable error code when unsupported", async () => {
    setEncoder(async (c) => ({ supported: false, config: c }));
    await expect(
      getSupportedVideoConfig(defaultExportSettings),
    ).rejects.toMatchObject({ code: "unsupported-codec" });
  });
});

describe("toMediabunnyCodec", () => {
  it("maps profile strings to codec families", () => {
    expect(toMediabunnyCodec("avc1.42E01E")).toBe("avc");
    expect(toMediabunnyCodec("vp09.00.10.08")).toBe("vp9");
    expect(toMediabunnyCodec("av01.0.05M.08")).toBe("av1");
  });
});
