import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultExportSettings,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";

const mocks = vi.hoisted(() => ({
  frameAt: vi.fn(),
  providerDispose: vi.fn(),
  rendererClear: vi.fn(),
  rendererRender: vi.fn(),
  rendererDispose: vi.fn(),
  convertToBlob: vi.fn(),
  gpuDone: vi.fn(),
  deviceDestroy: vi.fn(),
  writerAddFrame: vi.fn(),
  writerAddManifest: vi.fn(),
  writerFinalize: vi.fn(),
  writerAbort: vi.fn(),
}));

vi.mock("./FrameProvider", () => {
  class FrameProvider {
    static async createWithWebCodecs() {
      return new FrameProvider();
    }

    frameAt(...args: unknown[]) {
      return mocks.frameAt(...args);
    }

    dispose() {
      mocks.providerDispose();
    }
  }

  return {
    HtmlVideoFrameProvider: FrameProvider,
    StaticBitmapFrameProvider: FrameProvider,
  };
});

vi.mock("@/morph/layers/LayeredRenderer", () => ({
  LayeredRenderer: class {
    clear(...args: unknown[]) {
      mocks.rendererClear(...args);
    }

    renderFrame(...args: unknown[]) {
      mocks.rendererRender(...args);
    }

    dispose() {
      mocks.rendererDispose();
    }
  },
}));

vi.mock("./frameSequence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./frameSequence")>();
  return {
    ...actual,
    createFrameSequenceWriter: () => ({
      addFrame: mocks.writerAddFrame,
      addManifest: mocks.writerAddManifest,
      finalize: mocks.writerFinalize,
      abort: mocks.writerAbort,
    }),
  };
});

import { exportMorphToFrameZip } from "./exportMorph";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 16,
  height: 16,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

function inputs(signal: AbortSignal) {
  const project = createProject(image("a"), image("b"));
  return {
    project,
    settings: {
      ...defaultExportSettings,
      outputKind: "frames" as const,
      width: 16,
      height: 16,
      resolutionPreset: "custom" as const,
      durationSec: 1,
      fps: 12,
      includeManifest: false,
    },
    source: { width: 16, height: 16 } as ImageBitmap,
    target: { width: 16, height: 16 } as ImageBitmap,
    signal,
  };
}

function expectCleanup() {
  expect(mocks.providerDispose).toHaveBeenCalledTimes(1);
  expect(mocks.rendererDispose).toHaveBeenCalledTimes(1);
  expect(mocks.deviceDestroy).toHaveBeenCalledTimes(1);
  expect(mocks.writerAbort).toHaveBeenCalledTimes(1);
}

describe("frame-sequence export cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.frameAt.mockResolvedValue({
      a: { view: {}, width: 16, height: 16 },
      b: { view: {}, width: 16, height: 16 },
    });
    mocks.convertToBlob.mockResolvedValue(new Blob([new Uint8Array([1])]));
    mocks.gpuDone.mockResolvedValue(undefined);
    mocks.writerFinalize.mockResolvedValue(
      new Blob([new Uint8Array([1])], { type: "application/zip" }),
    );

    const device = {
      limits: { maxTextureDimension2D: 8_192 },
      queue: { onSubmittedWorkDone: mocks.gpuDone },
      destroy: mocks.deviceDestroy,
    };
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestDevice: vi.fn().mockResolvedValue(device),
        }),
        getPreferredCanvasFormat: vi.fn(() => "rgba8unorm"),
      },
    });

    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        convertToBlob(...args: unknown[]) {
          return mocks.convertToBlob(...args);
        }

        getContext() {
          return {
            configure: vi.fn(),
            getCurrentTexture: () => ({ createView: () => ({}) }),
          };
        }
      },
    );
  });

  it("cleans up after cancellation while waiting for a media frame", async () => {
    mocks.frameAt.mockReturnValueOnce(new Promise(() => {}));
    const controller = new AbortController();
    const running = exportMorphToFrameZip(inputs(controller.signal));
    await vi.waitFor(() => expect(mocks.frameAt).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(running).rejects.toMatchObject({ code: "cancelled" });
    expectCleanup();
  });

  it("cleans up after cancellation during PNG conversion", async () => {
    const png = deferred<Blob>();
    mocks.convertToBlob.mockReturnValueOnce(png.promise);
    const controller = new AbortController();
    const running = exportMorphToFrameZip(inputs(controller.signal));
    await vi.waitFor(() =>
      expect(mocks.convertToBlob).toHaveBeenCalledTimes(1),
    );

    controller.abort();
    png.resolve(new Blob([new Uint8Array([1])]));

    await expect(running).rejects.toMatchObject({ code: "cancelled" });
    expectCleanup();
  });

  it("cleans up after cancellation while a rendered GPU frame is pending", async () => {
    const gpu = deferred<void>();
    mocks.gpuDone.mockReturnValueOnce(gpu.promise);
    const controller = new AbortController();
    const running = exportMorphToFrameZip(inputs(controller.signal));
    await vi.waitFor(() => expect(mocks.rendererRender).toHaveBeenCalledOnce());

    controller.abort();
    gpu.resolve();

    await expect(running).rejects.toMatchObject({ code: "cancelled" });
    expectCleanup();
  });

  it("aborts the writer immediately during ZIP finalization", async () => {
    const zip = deferred<Blob>();
    mocks.writerFinalize.mockReturnValueOnce(zip.promise);
    mocks.writerAbort.mockImplementationOnce(() => {
      zip.reject(new Error("terminated"));
    });
    const controller = new AbortController();
    const running = exportMorphToFrameZip(inputs(controller.signal));
    await vi.waitFor(() => expect(mocks.writerFinalize).toHaveBeenCalledOnce());

    controller.abort();

    await expect(running).rejects.toMatchObject({ code: "cancelled" });
    expectCleanup();
  });
});
