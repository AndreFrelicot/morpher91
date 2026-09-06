import { beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  createProject,
  defaultExportSettings,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import {
  createFrameSequenceManifest,
  createFrameSequenceWriter,
  frameFileName,
  frameImageMimeType,
  safeExportBaseName,
} from "./frameSequence";

const zipControl = vi.hoisted(() => ({
  delayFinalChunk: false,
  releaseFinalChunk: null as (() => void) | null,
}));

vi.mock("fflate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fflate")>();
  type ZipCallback = NonNullable<ConstructorParameters<typeof actual.Zip>[0]>;
  type ZipEntry = Parameters<InstanceType<typeof actual.Zip>["add"]>[0];

  class ControlledZip {
    private readonly inner: InstanceType<typeof actual.Zip>;

    constructor(ondata: ZipCallback) {
      this.inner = new actual.Zip((error, chunk, final) => {
        if (final && zipControl.delayFinalChunk) {
          zipControl.releaseFinalChunk = () => ondata(error, chunk, final);
          return;
        }
        ondata(error, chunk, final);
      });
    }

    add(entry: ZipEntry) {
      this.inner.add(entry);
    }

    end() {
      this.inner.end();
    }

    terminate() {
      this.inner.terminate();
    }
  }

  return { ...actual, Zip: ControlledZip };
});

function image(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 100,
    height: 100,
    source: { kind: "data-url", value: "data:image/png;base64," },
    placement: defaultPlacement(),
  };
}

describe("frame sequence helpers", () => {
  beforeEach(() => {
    zipControl.delayFinalChunk = false;
    zipControl.releaseFinalChunk = null;
  });

  it("creates stable export-safe names", () => {
    expect(safeExportBaseName("Untitled morph")).toBe("Untitled-morph");
    expect(safeExportBaseName("   ")).toBe("morph");
  });

  it("pads frame filenames so they sort lexicographically", () => {
    expect(frameFileName("demo", 0, 120, "png")).toBe("frames/demo_000001.png");
    expect(frameFileName("demo", 119, 120, "png")).toBe(
      "frames/demo_000120.png",
    );
  });

  it("maps png to the browser blob mime type", () => {
    expect(frameImageMimeType("png")).toBe("image/png");
  });

  it("builds a manifest that matches the rendered frames", () => {
    const project = createProject(image("a"), image("b"), "Demo");
    const frameFiles = [
      { file: "frames/Demo_000001.png", index: 0, t: 0 },
      { file: "frames/Demo_000002.png", index: 1, t: 1 },
    ];

    expect(
      createFrameSequenceManifest({
        project,
        settings: defaultExportSettings,
        dimensions: { width: 1536, height: 864 },
        frameFiles,
      }),
    ).toMatchObject({
      name: "Demo",
      width: 1536,
      height: 864,
      frameCount: 2,
      format: "png",
      frames: frameFiles,
    });
  });

  it("streams frame files in order and builds a readable manifest", async () => {
    const project = createProject(image("a"), image("b"), "Demo");
    const writer = createFrameSequenceWriter();
    const frameFiles = [
      { file: "frames/Demo_000001.png", index: 0, t: 0 },
      { file: "frames/Demo_000002.png", index: 1, t: 1 },
    ];
    writer.addFrame({ ...frameFiles[0], bytes: new Uint8Array([1, 2, 3]) });
    writer.addFrame({ ...frameFiles[1], bytes: new Uint8Array([4, 5]) });
    writer.addManifest(
      createFrameSequenceManifest({
        project,
        settings: defaultExportSettings,
        dimensions: { width: 64, height: 64 },
        frameFiles,
      }),
    );
    const zip = new Uint8Array(await (await writer.finalize()).arrayBuffer());
    const entries = unzipSync(zip);
    expect(Object.keys(entries)).toEqual([
      "frames/Demo_000001.png",
      "frames/Demo_000002.png",
      "manifest.json",
    ]);
    expect(Array.from(entries["frames/Demo_000001.png"])).toEqual([1, 2, 3]);
    expect(Array.from(entries["frames/Demo_000002.png"])).toEqual([4, 5]);

    const manifest = JSON.parse(strFromU8(entries["manifest.json"])) as {
      width: number;
      height: number;
      frameCount: number;
      frames: { file: string; index: number; t: number }[];
    };
    expect(manifest).toMatchObject({
      width: 64,
      height: 64,
      frameCount: 2,
      frames: frameFiles,
    });
  });

  it("drops temporary frame objects and rejects work after abort", async () => {
    const writer = createFrameSequenceWriter();
    let frame: {
      file: string;
      index: number;
      t: number;
      bytes: Uint8Array;
    } | null = {
      file: "frames/Demo_000001.png",
      index: 0,
      t: 0,
      bytes: new Uint8Array([1, 2, 3]),
    };
    writer.addFrame(frame);
    frame = null;
    expect(frame).toBeNull();

    writer.abort();
    expect(() =>
      writer.addFrame({
        file: "frames/Demo_000002.png",
        index: 1,
        t: 1,
        bytes: new Uint8Array([4]),
      }),
    ).toThrow(expect.objectContaining({ code: "cancelled" }));
  });

  it("can omit the manifest", async () => {
    const writer = createFrameSequenceWriter();
    writer.addFrame({
      file: "frames/Demo_000001.png",
      index: 0,
      t: 0,
      bytes: new Uint8Array([1]),
    });
    const entries = unzipSync(
      new Uint8Array(await (await writer.finalize()).arrayBuffer()),
    );
    expect(Object.keys(entries)).toEqual(["frames/Demo_000001.png"]);
  });

  it("preserves real ZIP stream failures instead of reporting cancellation", () => {
    const writer = createFrameSequenceWriter();
    writer.addFrame({
      file: "x".repeat(65_536),
      index: 0,
      t: 0,
      bytes: new Uint8Array([1]),
    });

    expect(() => writer.finalize()).toThrow(
      expect.objectContaining({ code: 11, message: "filename too long" }),
    );
  });

  it("rejects the real writer when aborted during ZIP finalization", async () => {
    zipControl.delayFinalChunk = true;
    const writer = createFrameSequenceWriter();
    writer.addFrame({
      file: "frames/Demo_000001.png",
      index: 0,
      t: 0,
      bytes: new Uint8Array([1, 2, 3]),
    });

    const finalizing = writer.finalize();
    expect(zipControl.releaseFinalChunk).toEqual(expect.any(Function));

    writer.abort();

    await expect(finalizing).rejects.toMatchObject({ code: "cancelled" });
    zipControl.releaseFinalChunk?.();
  });
});
