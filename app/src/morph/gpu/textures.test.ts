import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadExternalImageToTexture } from "./textures";

describe("uploadExternalImageToTexture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores external images as premultiplied RGBA", () => {
    const copyExternalImageToTexture = vi.fn();
    const device = {
      queue: { copyExternalImageToTexture },
    } as unknown as GPUDevice;
    const texture = {} as GPUTexture;
    const source = { width: 20, height: 10 } as ImageBitmap;

    uploadExternalImageToTexture(device, texture, source);

    expect(copyExternalImageToTexture).toHaveBeenCalledWith(
      { source },
      { texture, premultipliedAlpha: true },
      [20, 10],
    );
  });

  it.each([
    {
      label: "VideoFrame",
      createSource: () => {
        class TestVideoFrame {
          displayWidth = 20;
          displayHeight = 10;
        }
        vi.stubGlobal("VideoFrame", TestVideoFrame);
        return new TestVideoFrame() as unknown as VideoFrame;
      },
    },
    {
      label: "HTMLVideoElement",
      createSource: () => document.createElement("video"),
    },
  ])(
    "falls back once to a reusable canvas when Gecko rejects $label",
    ({ createSource }) => {
      const source = createSource();
      const clearRect = vi.fn();
      const drawImage = vi.fn();
      const canvases: Array<{ width: number; height: number }> = [];
      vi.stubGlobal(
        "OffscreenCanvas",
        class {
          width: number;
          height: number;
          constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
            canvases.push(this);
          }
          getContext() {
            return { clearRect, drawImage };
          }
        },
      );
      const copyExternalImageToTexture = vi.fn(({ source: copiedSource }) => {
        if (copiedSource === source) {
          throw new TypeError("Unsupported GPUCopyExternalImageSource");
        }
      });
      const device = {
        queue: { copyExternalImageToTexture },
      } as unknown as GPUDevice;
      const texture = {} as GPUTexture;

      uploadExternalImageToTexture(device, texture, source, {
        width: 20,
        height: 10,
      });
      uploadExternalImageToTexture(device, texture, source, {
        width: 20,
        height: 10,
      });

      expect(canvases).toHaveLength(1);
      expect(clearRect).toHaveBeenCalledTimes(2);
      expect(drawImage).toHaveBeenCalledTimes(2);
      expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 20, 10);
      expect(copyExternalImageToTexture).toHaveBeenCalledTimes(3);
      expect(copyExternalImageToTexture.mock.calls[1][0]).toEqual({
        source: canvases[0],
      });
      expect(copyExternalImageToTexture.mock.calls[2][0]).toEqual({
        source: canvases[0],
      });
    },
  );

  it("does not hide unrelated upload errors", () => {
    const error = new DOMException("Cross-origin source", "SecurityError");
    const device = {
      queue: { copyExternalImageToTexture: vi.fn(() => void 0) },
    } as unknown as GPUDevice;
    vi.mocked(device.queue.copyExternalImageToTexture).mockImplementation(
      () => {
        throw error;
      },
    );

    expect(() =>
      uploadExternalImageToTexture(
        device,
        {} as GPUTexture,
        { width: 20, height: 10 } as ImageBitmap,
      ),
    ).toThrow(error);
  });
});
