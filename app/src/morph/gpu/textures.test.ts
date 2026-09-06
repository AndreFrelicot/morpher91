import { describe, expect, it, vi } from "vitest";
import { uploadExternalImageToTexture } from "./textures";

describe("uploadExternalImageToTexture", () => {
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
});
