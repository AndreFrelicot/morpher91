import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
} from "@/morph/model";
import {
  hydrateProjectImages,
  loadImageAsset,
  loadLocalImage,
} from "./loadImage";

function embeddedImage(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 1,
    height: 1,
    source: { kind: "data-url", value: "data:image/png;base64,ZmFrZQ==" },
    placement: defaultPlacement(),
  };
}

function mockImageDecode(width = 320, height = 240) {
  const bitmap = { width, height, close: vi.fn() } as unknown as ImageBitmap;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["fake"], { type: "image/png" }),
    })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap),
  );
  return bitmap;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadImageAsset", () => {
  it("loads an embedded data-url image into a preview bitmap", async () => {
    const bitmap = mockImageDecode();
    const loaded = await loadImageAsset(embeddedImage("a.png"));

    expect(loaded?.bitmap).toBe(bitmap);
    expect(loaded?.asset.width).toBe(320);
    expect(loaded?.asset.height).toBe(240);
    expect(loaded?.asset.source.kind).toBe("data-url");
  });

  it("hydrates project images from embedded sources", async () => {
    mockImageDecode(128, 96);
    const project = createProject(
      embeddedImage("a.png"),
      embeddedImage("b.png"),
    );

    const hydrated = await hydrateProjectImages(project);

    expect(hydrated.source?.asset.width).toBe(128);
    expect(hydrated.target?.asset.height).toBe(96);
    expect(hydrated.project.images.source.width).toBe(128);
    expect(hydrated.project.images.target.height).toBe(96);
  });
});

describe("loadLocalImage", () => {
  it("keeps original asset dimensions when the preview bitmap is resized", async () => {
    const probe = {
      width: 4000,
      height: 2000,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const preview = {
      width: 1536,
      height: 768,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValueOnce(probe).mockResolvedValueOnce(preview),
    );

    const loaded = await loadLocalImage(
      new File(["fake"], "large.png", { type: "image/png" }),
    );

    expect(loaded.asset.width).toBe(4000);
    expect(loaded.asset.height).toBe(2000);
    expect(loaded.bitmap).toBe(preview);
    expect(probe.close).toHaveBeenCalledOnce();
  });
});
