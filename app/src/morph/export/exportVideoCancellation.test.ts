import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultExportSettings,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";

const mocks = vi.hoisted(() => ({
  frameAt: vi.fn(),
  providerDispose: vi.fn(),
  rendererRender: vi.fn(),
  rendererDispose: vi.fn(),
  gpuDone: vi.fn(),
  deviceDestroy: vi.fn(),
  outputStart: vi.fn(),
  outputFinalize: vi.fn(),
  outputCancel: vi.fn(),
  outputAddVideoTrack: vi.fn(),
  packetAdd: vi.fn(),
  encoderConfigure: vi.fn(),
  encoderEncode: vi.fn(),
  encoderFlush: vi.fn(),
  encoderReset: vi.fn(),
  encoderClose: vi.fn(),
  encoderInit: null as VideoEncoderInit | null,
  frameClose: vi.fn(),
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
    renderFrame(...args: unknown[]) {
      mocks.rendererRender(...args);
    }

    dispose() {
      mocks.rendererDispose();
    }
  },
}));

vi.mock("mediabunny", () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = new Uint8Array([1, 2, 3]).buffer;
  }

  class Output {
    readonly target: BufferTarget;

    constructor({ target }: { target: BufferTarget }) {
      this.target = target;
    }

    addVideoTrack(...args: unknown[]) {
      mocks.outputAddVideoTrack(...args);
    }

    start() {
      return mocks.outputStart();
    }

    finalize() {
      return mocks.outputFinalize();
    }

    cancel() {
      return mocks.outputCancel();
    }
  }

  class EncodedVideoPacketSource {
    add(...args: unknown[]) {
      return mocks.packetAdd(...args);
    }
  }

  return {
    BufferTarget,
    EncodedPacket: {
      fromEncodedChunk: vi.fn(() => ({})),
    },
    EncodedVideoPacketSource,
    Mp4OutputFormat: class {},
    Output,
    WebMOutputFormat: class {},
  };
});

import { exportMorphToVideo } from "./exportMorph";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
  return {
    project: createProject(image("a"), image("b")),
    settings: {
      ...defaultExportSettings,
      width: 16,
      height: 16,
      durationSec: 1,
      fps: 12,
    },
    source: { width: 16, height: 16 } as ImageBitmap,
    target: { width: 16, height: 16 } as ImageBitmap,
    signal,
  };
}

function expectRenderCleanup() {
  expect(mocks.providerDispose).toHaveBeenCalledTimes(1);
  expect(mocks.rendererDispose).toHaveBeenCalledTimes(1);
  expect(mocks.deviceDestroy).toHaveBeenCalledTimes(1);
}

describe("video export cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encoderInit = null;
    mocks.frameAt.mockResolvedValue({
      a: { view: {}, width: 16, height: 16 },
      b: { view: {}, width: 16, height: 16 },
    });
    mocks.gpuDone.mockResolvedValue(undefined);
    mocks.outputStart.mockResolvedValue(undefined);
    mocks.outputFinalize.mockResolvedValue(undefined);
    mocks.outputCancel.mockResolvedValue(undefined);
    mocks.packetAdd.mockResolvedValue(undefined);
    mocks.encoderFlush.mockResolvedValue(undefined);

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
        getContext() {
          return {
            configure: vi.fn(),
            getCurrentTexture: () => ({ createView: () => ({}) }),
          };
        }
      },
    );
    vi.stubGlobal(
      "VideoFrame",
      class {
        close() {
          mocks.frameClose();
        }
      },
    );
    vi.stubGlobal(
      "VideoEncoder",
      class extends EventTarget {
        static isConfigSupported(config: VideoEncoderConfig) {
          return Promise.resolve({ supported: true, config });
        }

        readonly encodeQueueSize = 0;

        constructor(init: VideoEncoderInit) {
          super();
          mocks.encoderInit = init;
        }

        configure(...args: unknown[]) {
          mocks.encoderConfigure(...args);
        }

        encode(...args: unknown[]) {
          mocks.encoderEncode(...args);
        }

        flush() {
          return mocks.encoderFlush();
        }

        reset() {
          mocks.encoderReset();
        }

        close() {
          mocks.encoderClose();
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resets and closes the encoder, removes its listener, and does not leak a rejection when aborted during encoding", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      const running = exportMorphToVideo({
        ...inputs(controller.signal),
        onProgress: ({ phase }) => {
          if (phase === "encoding") controller.abort();
        },
      });
      const rejection = expect(running).rejects.toMatchObject({
        code: "cancelled",
      });

      await rejection;
      await new Promise((resolve) => setTimeout(resolve, 0));

      const abortEncoder = addListener.mock.calls[0]?.[1];
      expect(abortEncoder).toEqual(expect.any(Function));
      expect(mocks.encoderReset).toHaveBeenCalledTimes(1);
      expect(mocks.encoderClose).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith("abort", abortEncoder);
      expect(mocks.outputCancel).toHaveBeenCalledTimes(1);
      expect(mocks.frameClose).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
      expectRenderCleanup();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("cancels the output and closes the encoder after an encoding error", async () => {
    const encodingError = new DOMException("encoding failed", "EncodingError");
    mocks.encoderEncode.mockImplementationOnce(() => {
      mocks.encoderInit?.error(encodingError);
    });
    const controller = new AbortController();

    await expect(
      exportMorphToVideo(inputs(controller.signal)),
    ).rejects.toMatchObject({ code: "gpu-failure", cause: encodingError });

    expect(mocks.outputCancel).toHaveBeenCalledTimes(1);
    expect(mocks.encoderClose).toHaveBeenCalledTimes(1);
    expectRenderCleanup();
  });

  it("rejects as cancelled when abort happens during output finalization", async () => {
    const finalization = deferred<void>();
    mocks.outputFinalize.mockReturnValueOnce(finalization.promise);
    const controller = new AbortController();
    const running = exportMorphToVideo(inputs(controller.signal));
    const rejection = expect(running).rejects.toMatchObject({
      code: "cancelled",
    });
    await vi.waitFor(() => expect(mocks.outputFinalize).toHaveBeenCalledOnce());

    controller.abort();
    finalization.resolve();

    await rejection;
    expect(mocks.encoderReset).toHaveBeenCalledTimes(1);
    expect(mocks.outputCancel).toHaveBeenCalledTimes(1);
    expect(mocks.encoderClose).toHaveBeenCalledTimes(1);
    expectRenderCleanup();
  });
});
