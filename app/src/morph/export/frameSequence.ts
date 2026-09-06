import { strToU8, Zip, ZipPassThrough } from "fflate";
import type {
  ExportSettings,
  FrameImageFormat,
  MorphProject,
} from "@/morph/model";
import type { ExportDimensions } from "./exportDimensions";
import { ExportError } from "./exportValidation";

export type FrameSequenceManifest = {
  name: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  frameCount: number;
  startT: number;
  endT: number;
  includePingPong: boolean;
  format: FrameImageFormat;
  frames: { file: string; index: number; t: number }[];
};

export type EncodedSequenceFrame = {
  file: string;
  index: number;
  t: number;
  bytes: Uint8Array;
};

export interface FrameSequenceWriter {
  addFrame(frame: EncodedSequenceFrame): void;
  addManifest(manifest: FrameSequenceManifest): void;
  finalize(): Promise<Blob>;
  abort(): void;
}

export function safeExportBaseName(name: string): string {
  return name.trim().replace(/[^\w-]+/g, "-") || "morph";
}

export function frameImageExtension(format: FrameImageFormat): string {
  switch (format) {
    case "png":
      return "png";
  }
}

export function frameImageMimeType(format: FrameImageFormat): string {
  switch (format) {
    case "png":
      return "image/png";
  }
}

export function frameFileName(
  baseName: string,
  index: number,
  frameCount: number,
  format: FrameImageFormat,
): string {
  const padding = Math.max(6, String(frameCount).length);
  const frameNumber = String(index + 1).padStart(padding, "0");
  return `frames/${baseName}_${frameNumber}.${frameImageExtension(format)}`;
}

export function createFrameSequenceManifest({
  project,
  settings,
  dimensions,
  frameFiles,
}: {
  project: MorphProject;
  settings: ExportSettings;
  dimensions: ExportDimensions;
  frameFiles: { file: string; index: number; t: number }[];
}): FrameSequenceManifest {
  return {
    name: project.name,
    width: dimensions.width,
    height: dimensions.height,
    fps: settings.fps,
    durationSec: settings.durationSec,
    frameCount: frameFiles.length,
    startT: settings.startT,
    endT: settings.endT,
    includePingPong: settings.includePingPong,
    format: settings.frameFormat,
    frames: frameFiles,
  };
}

export function createFrameSequenceWriter(): FrameSequenceWriter {
  let state: "open" | "finalizing" | "finalized" | "aborted" = "open";
  let abortReason:
    | { type: "cancelled" }
    | { type: "error"; error: unknown }
    | null = null;
  let chunks: BlobPart[] = [];
  let resolveFinal: ((blob: Blob) => void) | null = null;
  let rejectFinal: ((error: unknown) => void) | null = null;
  const final = new Promise<Blob>((resolve, reject) => {
    resolveFinal = resolve;
    rejectFinal = reject;
  });
  void final.catch(() => undefined);
  const zip = new Zip((error, chunk, finished) => {
    if (state === "aborted") return;
    if (error) {
      state = "aborted";
      abortReason = { type: "error", error };
      chunks = [];
      rejectFinal?.(error);
      return;
    }
    chunks.push(
      chunk.buffer instanceof ArrayBuffer
        ? (chunk as Uint8Array<ArrayBuffer>)
        : new Uint8Array(chunk),
    );
    if (finished) {
      state = "finalized";
      resolveFinal?.(new Blob(chunks, { type: "application/zip" }));
      chunks = [];
    }
  });

  const assertOpen = () => {
    if (state === "aborted") {
      if (abortReason?.type === "error") throw abortReason.error;
      throw new ExportError("cancelled");
    }
    if (state !== "open") throw new ExportError("gpu-failure");
  };
  const add = (file: string, bytes: Uint8Array) => {
    assertOpen();
    const entry = new ZipPassThrough(file);
    zip.add(entry);
    entry.push(bytes, true);
  };

  return {
    addFrame: ({ file, bytes }) => add(file, bytes),
    addManifest: (manifest) =>
      add("manifest.json", strToU8(JSON.stringify(manifest, null, 2))),
    finalize: () => {
      assertOpen();
      state = "finalizing";
      zip.end();
      return final;
    },
    abort: () => {
      if (state === "aborted" || state === "finalized") return;
      const wasFinalizing = state === "finalizing";
      state = "aborted";
      abortReason = { type: "cancelled" };
      try {
        zip.terminate();
      } catch {
        // A synchronous ZIP error may already have terminated the stream.
      }
      chunks = [];
      if (wasFinalizing) rejectFinal?.(new ExportError("cancelled"));
    },
  };
}
