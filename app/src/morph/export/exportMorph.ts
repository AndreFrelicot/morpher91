import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import type { ExportSettings, ImageAsset, MorphProject } from "@/morph/model";
import {
  normalizeBackgroundForOutput,
  progressToTau,
  resolveTimelineFramePair,
  videoLocalTimeSec,
} from "@/morph/model";
import { LayeredRenderer } from "@/morph/layers/LayeredRenderer";
import { canvasAlphaMode } from "@/morph/layers/renderBackground";
import { getSupportedVideoConfig, toMediabunnyCodec } from "./codecSupport";
import { resolveExportDimensions, toEvenDimensions } from "./exportDimensions";
import type { ExportDimensions } from "./exportDimensions";
import { projectForExportResolution } from "./exportProject";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import {
  HtmlVideoFrameProvider,
  StaticBitmapFrameProvider,
} from "./FrameProvider";
import { computeFrameTimes } from "./exportTiming";
import {
  drainPendingWork,
  waitForEncoderCapacity,
  waitForPendingWorkCapacity,
} from "./exportBackpressure";
import {
  effectiveExportDuration,
  ExportError,
  normalizeExportError,
  throwIfExportAborted,
  validateExportJob,
} from "./exportValidation";
import {
  createFrameSequenceManifest,
  createFrameSequenceWriter,
  frameFileName,
  frameImageMimeType,
  safeExportBaseName,
} from "./frameSequence";

export type ExportPhase = "rendering" | "encoding" | "muxing" | "zipping";

export type ExportProgress = {
  phase: ExportPhase;
  frameIndex: number;
  frameCount: number;
};

export type ExportInputs = {
  project: MorphProject;
  settings: ExportSettings;
  source: ImageBitmap;
  target: ImageBitmap;
  sourceVideo?: LoadedVideo | null;
  targetVideo?: LoadedVideo | null;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
};

export type ExportResult = { blob: Blob; filename: string };

export function assertExportMediaAvailable(
  inputs: Pick<ExportInputs, "project" | "sourceVideo" | "targetVideo">,
): void {
  if (
    (inputs.project.videos?.source &&
      inputs.sourceVideo?.asset.id !== inputs.project.videos.source.id) ||
    (inputs.project.videos?.target &&
      inputs.targetVideo?.asset.id !== inputs.project.videos.target.id)
  ) {
    throw new ExportError("media-missing");
  }
}

const filenameFor = (project: MorphProject, ext: string): string => {
  return `${safeExportBaseName(project.name)}.${ext}`;
};

function abortable<T>(
  promise: T | PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  throwIfExportAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(new ExportError("cancelled"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

type RenderedMorphFrame = {
  index: number;
  t: number;
  frameCount: number;
  canvas: OffscreenCanvas;
  dimensions: ExportDimensions;
};

type RenderMorphFramesResult = {
  frameCount: number;
  dimensions: ExportDimensions;
};

type PreparedExportFrames = {
  project: MorphProject;
  settings: ExportSettings;
  source: ImageBitmap;
  target: ImageBitmap;
  sourceVideo?: LoadedVideo | null;
  targetVideo?: LoadedVideo | null;
  dimensions: ExportDimensions;
  dispose: () => void;
};

async function loadExportBitmap(
  asset: ImageAsset,
  fallback: ImageBitmap,
): Promise<{ bitmap: ImageBitmap; owned: boolean }> {
  if (asset.source.kind !== "data-url" && asset.source.kind !== "object-url") {
    return { bitmap: fallback, owned: false };
  }

  try {
    const response = await fetch(asset.source.value);
    if (!response.ok) return { bitmap: fallback, owned: false };

    const bitmap = await createImageBitmap(await response.blob(), {
      imageOrientation: "from-image",
    });
    return { bitmap, owned: true };
  } catch {
    return { bitmap: fallback, owned: false };
  }
}

async function prepareExportFrames(
  inputs: ExportInputs,
): Promise<PreparedExportFrames> {
  throwIfExportAborted(inputs.signal);
  const [sourceImage, targetImage] = await Promise.all([
    loadExportBitmap(inputs.project.images.source, inputs.source),
    loadExportBitmap(inputs.project.images.target, inputs.target),
  ]);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (sourceImage.owned) sourceImage.bitmap.close();
    if (targetImage.owned) targetImage.bitmap.close();
  };
  try {
    throwIfExportAborted(inputs.signal);
    const imageDimensions = {
      source: {
        width: sourceImage.bitmap.width,
        height: sourceImage.bitmap.height,
      },
      target: {
        width: targetImage.bitmap.width,
        height: targetImage.bitmap.height,
      },
    };
    const displayDimensions = {
      source: {
        width: inputs.source.width,
        height: inputs.source.height,
      },
      target: {
        width: inputs.target.width,
        height: inputs.target.height,
      },
    };
    const resolvedDimensions = resolveExportDimensions(
      inputs.project,
      inputs.settings,
      imageDimensions,
    );
    // Video encoders (H.264/VideoToolbox on iOS) reject odd sizes; frame/PNG
    // export keeps the native resolution (M12 lot 5).
    const dimensions =
      inputs.settings.outputKind === "video"
        ? toEvenDimensions(resolvedDimensions)
        : resolvedDimensions;
    const settings = {
      ...inputs.settings,
      ...dimensions,
      background: normalizeBackgroundForOutput(
        inputs.settings.outputKind,
        inputs.settings.background,
      ),
      durationSec: effectiveExportDuration(inputs.project, inputs.settings),
    };
    const renderProject = projectForExportResolution({
      project: inputs.project,
      preset: settings.resolutionPreset,
      dimensions,
      images: imageDimensions,
      displayImages: displayDimensions,
    });
    validateExportJob(renderProject, settings, { dimensions });

    return {
      project: renderProject,
      settings,
      source: sourceImage.bitmap,
      target: targetImage.bitmap,
      sourceVideo: inputs.sourceVideo,
      targetVideo: inputs.targetVideo,
      dimensions,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

async function renderMorphFrames(
  inputs: PreparedExportFrames & {
    onProgress?: (progress: ExportProgress) => void;
    signal?: AbortSignal;
  },
  onFrame: (frame: RenderedMorphFrame) => void | Promise<void>,
): Promise<RenderMorphFramesResult> {
  const {
    project,
    settings,
    source,
    target,
    sourceVideo,
    targetVideo,
    onProgress,
    signal,
  } = inputs;

  if (!navigator.gpu) {
    throw new ExportError("unsupported-webgpu");
  }

  const { dimensions } = inputs;
  const { width, height } = dimensions;

  throwIfExportAborted(signal);
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  throwIfExportAborted(signal);
  if (!adapter) throw new ExportError("gpu-failure");
  const device = await adapter.requestDevice();
  let renderer: LayeredRenderer | null = null;
  let provider: HtmlVideoFrameProvider | StaticBitmapFrameProvider | null =
    null;
  try {
    validateExportJob(project, settings, {
      dimensions,
      deviceLimits: device.limits,
    });
    throwIfExportAborted(signal);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) throw new ExportError("gpu-failure");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
      device,
      format,
      alphaMode: canvasAlphaMode(settings.background),
    });

    renderer = new LayeredRenderer(device, format);
    provider =
      sourceVideo || targetVideo
        ? await abortable(
            // WebCodecs decode when supported; <video> seeks as fallback.
            HtmlVideoFrameProvider.createWithWebCodecs(
              device,
              { bitmap: source, video: sourceVideo ?? null },
              { bitmap: target, video: targetVideo ?? null },
            ),
            signal,
          )
        : new StaticBitmapFrameProvider(device, source, target);
    const times = computeFrameTimes(settings, project);
    const frameCount = times.length;

    for (let i = 0; i < frameCount; i++) {
      throwIfExportAborted(signal);

      onProgress?.({ phase: "rendering", frameIndex: i, frameCount });
      const tauSec = progressToTau(project, times[i]);
      const sourceTimeSec = videoLocalTimeSec(project, "source", tauSec);
      const targetTimeSec = videoLocalTimeSec(project, "target", tauSec);
      const framePair = resolveTimelineFramePair(
        project,
        tauSec,
        await abortable(
          provider.frameAt(times[i], {
            tauSec,
            sourceTimeSec,
            targetTimeSec,
          }),
          signal,
        ),
      );
      throwIfExportAborted(signal);
      const targetView = ctx.getCurrentTexture().createView();
      if (!framePair) {
        renderer.clear(targetView, settings.background);
      } else {
        renderer.renderFrame(
          {
            target: targetView,
            canvasWidth: width,
            canvasHeight: height,
            a: framePair.a,
            b: framePair.b,
            t: times[i],
            tauSec,
            sourceTimeSec,
            targetTimeSec,
            project,
          },
          { background: settings.background },
        );
      }
      await abortable(device.queue.onSubmittedWorkDone(), signal);
      throwIfExportAborted(signal);

      await abortable(
        Promise.resolve(
          onFrame({
            index: i,
            t: times[i],
            frameCount,
            canvas,
            dimensions,
          }),
        ),
        signal,
      );
      throwIfExportAborted(signal);
    }
    return { frameCount, dimensions };
  } finally {
    try {
      provider?.dispose();
    } finally {
      try {
        renderer?.dispose();
      } finally {
        device.destroy();
      }
    }
  }
}

/**
 * Renders the morph frame-by-frame off-screen and muxes it into a downloadable
 * video (PRD §12.1). WebCodecs encodes (`VideoEncoder`), Mediabunny muxes
 * (§24.4). Runs on the main thread in v1 — the per-frame GPU await yields so the
 * progress callback can update the UI (export worker deferred, see tasks.md).
 *
 * Backends are untouched: each frame is drawn into an off-screen WebGPU canvas
 * exactly like the preview, just at the export resolution. The A/B textures come
 * from a {@link StaticBitmapFrameProvider} (the v1 frame-provider seam, §29.4).
 */
export async function exportMorphToVideo(
  inputs: ExportInputs,
): Promise<ExportResult> {
  const { project, settings, onProgress, signal } = inputs;
  validateExportJob(project, settings);
  assertExportMediaAvailable(inputs);
  throwIfExportAborted(signal);

  if (!("VideoEncoder" in globalThis)) {
    throw new ExportError("unsupported-webcodecs");
  }

  let prepared: PreparedExportFrames;
  try {
    prepared = await prepareExportFrames(inputs);
  } catch (error) {
    throw normalizeExportError(error, signal);
  }
  try {
    // Throws an unsupported-codec ExportError when this configuration cannot
    // be encoded at the requested resolution.
    const encoderConfig = await getSupportedVideoConfig(prepared.settings);
    throwIfExportAborted(signal);

    const output = new Output({
      format:
        settings.container === "webm"
          ? new WebMOutputFormat()
          : new Mp4OutputFormat(),
      target: new BufferTarget(),
    });
    const packetSource = new EncodedVideoPacketSource(
      toMediabunnyCodec(settings.codec),
    );
    output.addVideoTrack(packetSource, { frameRate: settings.fps });
    try {
      await output.start();
      throwIfExportAborted(signal);
    } catch (error) {
      await output.cancel().catch(() => {});
      throw error;
    }

    const packetAdds = new Set<Promise<void>>();
    let packetError: unknown = null;
    let encodeError: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const tracked = packetSource
          .add(EncodedPacket.fromEncodedChunk(chunk), meta)
          .catch((error: unknown) => {
            packetError = error;
          })
          .finally(() => packetAdds.delete(tracked));
        packetAdds.add(tracked);
      },
      error: (err) => {
        encodeError = err;
      },
    });
    try {
      encoder.configure(encoderConfig);
    } catch (error) {
      encoder.close();
      await output.cancel().catch(() => {});
      throw error;
    }
    const abortEncoder = () => {
      try {
        encoder.reset();
      } catch {
        // The encoder may already be closed by a concurrent failure cleanup.
      }
    };
    signal?.addEventListener("abort", abortEncoder, { once: true });

    const frameDurationUs = 1e6 / settings.fps;
    const keyFrameEvery = Math.max(1, Math.round(settings.fps * 2));
    let renderedFrameCount = 0;

    try {
      await renderMorphFrames(
        {
          ...prepared,
          onProgress,
          signal,
        },
        async ({ canvas, index, frameCount }) => {
          renderedFrameCount = frameCount;
          const i = index;
          if (encodeError) throw encodeError;
          if (packetError) throw packetError;
          await waitForEncoderCapacity(encoder, signal);
          await waitForPendingWorkCapacity(packetAdds, signal);
          throwIfExportAborted(signal);

          const frame = new VideoFrame(canvas, {
            timestamp: Math.round(i * frameDurationUs),
            duration: Math.round(frameDurationUs),
          });
          onProgress?.({ phase: "encoding", frameIndex: i, frameCount });
          try {
            encoder.encode(frame, { keyFrame: i % keyFrameEvery === 0 });
          } finally {
            frame.close();
          }
        },
      );

      throwIfExportAborted(signal);
      await encoder.flush();
      throwIfExportAborted(signal);
      if (encodeError) throw encodeError;
      if (packetError) throw packetError;

      onProgress?.({
        phase: "muxing",
        frameIndex: renderedFrameCount,
        frameCount: renderedFrameCount,
      });
      await drainPendingWork(packetAdds, signal);
      if (packetError) throw packetError;
      await output.finalize();
      throwIfExportAborted(signal);
    } catch (err) {
      await output.cancel().catch(() => {});
      throw err;
    } finally {
      signal?.removeEventListener("abort", abortEncoder);
      try {
        encoder.close();
      } catch {
        // reset()/device loss may already have closed the encoder.
      }
    }

    const buffer = output.target.buffer;
    if (!buffer) throw new ExportError("gpu-failure");
    const mime = settings.container === "webm" ? "video/webm" : "video/mp4";
    return {
      blob: new Blob([buffer], { type: mime }),
      filename: filenameFor(project, settings.container),
    };
  } catch (error) {
    throw normalizeExportError(error, signal);
  } finally {
    prepared.dispose();
  }
}

export async function exportMorphToFrameZip(
  inputs: ExportInputs,
): Promise<ExportResult> {
  const { project, settings, onProgress, signal } = inputs;
  validateExportJob(project, settings);
  assertExportMediaAvailable(inputs);
  throwIfExportAborted(signal);
  const baseName = safeExportBaseName(project.name);
  let prepared: PreparedExportFrames;
  try {
    prepared = await prepareExportFrames(inputs);
  } catch (error) {
    throw normalizeExportError(error, signal);
  }
  const writer = createFrameSequenceWriter();
  let writerAborted = false;
  const abortWriter = () => {
    if (writerAborted) return;
    writerAborted = true;
    writer.abort();
  };
  signal?.addEventListener("abort", abortWriter, { once: true });
  const frameFiles: { file: string; index: number; t: number }[] = [];
  let renderedDimensions = prepared.dimensions;
  let renderedFrameCount = 0;

  try {
    await renderMorphFrames(
      { ...prepared, onProgress, signal },
      async ({ canvas, index, t, frameCount, dimensions }) => {
        throwIfExportAborted(signal);
        renderedDimensions = dimensions;
        renderedFrameCount = frameCount;

        const file = frameFileName(
          baseName,
          index,
          frameCount,
          settings.frameFormat,
        );
        onProgress?.({ phase: "encoding", frameIndex: index, frameCount });
        const blob = await canvas.convertToBlob({
          type: frameImageMimeType(settings.frameFormat),
        });
        throwIfExportAborted(signal);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        throwIfExportAborted(signal);
        writer.addFrame({
          file,
          index,
          t,
          bytes,
        });
        frameFiles.push({ file, index, t });
      },
    );

    throwIfExportAborted(signal);
    onProgress?.({
      phase: "zipping",
      frameIndex: renderedFrameCount,
      frameCount: renderedFrameCount,
    });
    if (settings.includeManifest) {
      writer.addManifest(
        createFrameSequenceManifest({
          project,
          settings: prepared.settings,
          dimensions: renderedDimensions,
          frameFiles,
        }),
      );
    }
    throwIfExportAborted(signal);
    return {
      blob: await writer.finalize(),
      filename: `${baseName}_frames.zip`,
    };
  } catch (error) {
    abortWriter();
    throw normalizeExportError(error, signal);
  } finally {
    signal?.removeEventListener("abort", abortWriter);
    prepared.dispose();
  }
}
