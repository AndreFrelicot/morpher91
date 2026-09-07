export type TextureImageSource =
  | ImageBitmap
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageData
  | OffscreenCanvas
  | VideoFrame;

export type TextureImageSize = { width: number; height: number };

type DynamicSourceKind = "video" | "video-frame";
type ScratchCanvas = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

/** Gecko versions can expose WebGPU/WebCodecs while rejecting video sources
 * in copyExternalImageToTexture (Mozilla bugs 1922098/1922100). Remember that
 * result per device/source kind, while capable browsers stay on the direct
 * zero-intermediate-copy path. */
const unsupportedDynamicSources = new WeakMap<
  GPUDevice,
  Set<DynamicSourceKind>
>();
const scratchCanvases = new WeakMap<GPUDevice, ScratchCanvas>();

function sourceSize(source: TextureImageSource): TextureImageSize {
  if (
    typeof HTMLVideoElement !== "undefined" &&
    source instanceof HTMLVideoElement
  ) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) {
    return { width: source.displayWidth, height: source.displayHeight };
  }
  const sized = source as Exclude<
    TextureImageSource,
    HTMLVideoElement | VideoFrame
  >;
  return { width: sized.width, height: sized.height };
}

function dynamicSourceKind(
  source: TextureImageSource,
): DynamicSourceKind | null {
  if (
    typeof HTMLVideoElement !== "undefined" &&
    source instanceof HTMLVideoElement
  ) {
    return "video";
  }
  if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) {
    return "video-frame";
  }
  return null;
}

function copyExternalImageDirect(
  device: GPUDevice,
  texture: GPUTexture,
  source: TextureImageSource,
  size: TextureImageSize,
): void {
  device.queue.copyExternalImageToTexture(
    { source } as unknown as GPUImageCopyExternalImage,
    { texture, premultipliedAlpha: true },
    [size.width, size.height],
  );
}

function scratchCanvas(
  device: GPUDevice,
  size: TextureImageSize,
): ScratchCanvas {
  let scratch = scratchCanvases.get(device);
  if (!scratch) {
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(size.width, size.height)
        : document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a video upload canvas.");
    scratch = {
      canvas,
      context: context as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D,
    };
    scratchCanvases.set(device, scratch);
  }
  if (
    scratch.canvas.width !== size.width ||
    scratch.canvas.height !== size.height
  ) {
    scratch.canvas.width = size.width;
    scratch.canvas.height = size.height;
  }
  return scratch;
}

function copyDynamicSourceThroughCanvas(
  device: GPUDevice,
  texture: GPUTexture,
  source: TextureImageSource,
  size: TextureImageSize,
): void {
  const { canvas, context } = scratchCanvas(device, size);
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(
    source as HTMLVideoElement | VideoFrame,
    0,
    0,
    size.width,
    size.height,
  );
  copyExternalImageDirect(device, texture, canvas, size);
}

export function uploadExternalImageToTexture(
  device: GPUDevice,
  texture: GPUTexture,
  source: TextureImageSource,
  size: TextureImageSize = sourceSize(source),
): void {
  const kind = dynamicSourceKind(source);
  let unsupported = unsupportedDynamicSources.get(device);
  if (!kind || !unsupported?.has(kind)) {
    try {
      copyExternalImageDirect(device, texture, source, size);
      return;
    } catch (error) {
      // Only the synchronous WebIDL conversion failure documented by Mozilla
      // selects the compatibility path. Security, bounds and validation errors
      // remain visible to callers instead of being hidden by the fallback.
      if (!kind || !(error instanceof TypeError)) throw error;
    }
  }

  copyDynamicSourceThroughCanvas(device, texture, source, size);
  unsupported ??= new Set<DynamicSourceKind>();
  unsupported.add(kind);
  unsupportedDynamicSources.set(device, unsupported);
}

/** Uploads an external image source into a sampleable rgba8unorm texture. PRD §11.3 */
export function createImageTexture(
  device: GPUDevice,
  bitmap: TextureImageSource,
  size: TextureImageSize = sourceSize(bitmap),
): GPUTexture {
  const texture = device.createTexture({
    size: [size.width, size.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  uploadExternalImageToTexture(device, texture, bitmap, size);
  return texture;
}

export function createLinearSampler(device: GPUDevice): GPUSampler {
  return device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
}
