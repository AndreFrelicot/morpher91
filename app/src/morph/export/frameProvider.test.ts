import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StaticBitmapFrameProvider } from "./FrameProvider";

// jsdom has no WebGPU globals; createImageTexture only reads these bit flags.
beforeAll(() => {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** Minimal GPUDevice stub: records textures and hands back identifiable views. */
function fakeDevice() {
  const destroyed: string[] = [];
  let n = 0;
  const device = {
    createTexture: () => {
      const id = `tex${n++}`;
      return {
        createView: () => `${id}-view`,
        destroy: () => destroyed.push(id),
      };
    },
    queue: { copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice;
  return { device, destroyed };
}

const bitmap = (width: number, height: number) =>
  ({ width, height }) as unknown as ImageBitmap;

describe("StaticBitmapFrameProvider", () => {
  it("returns slots carrying each bitmap's dimensions", () => {
    const { device } = fakeDevice();
    const provider = new StaticBitmapFrameProvider(
      device,
      bitmap(640, 480),
      bitmap(800, 600),
    );
    const { a, b } = provider.frameAt();
    expect(a).toMatchObject({ width: 640, height: 480 });
    expect(b).toMatchObject({ width: 800, height: 600 });
  });

  it("returns the same textures regardless of t (static)", () => {
    const { device } = fakeDevice();
    const provider = new StaticBitmapFrameProvider(
      device,
      bitmap(64, 64),
      bitmap(64, 64),
    );
    const first = provider.frameAt();
    const later = provider.frameAt();
    expect(later.a.view).toBe(first.a.view);
    expect(later.b.view).toBe(first.b.view);
  });

  it("destroys both textures on dispose", () => {
    const { device, destroyed } = fakeDevice();
    const provider = new StaticBitmapFrameProvider(
      device,
      bitmap(64, 64),
      bitmap(64, 64),
    );
    provider.dispose();
    expect(destroyed).toHaveLength(2);
  });
});
