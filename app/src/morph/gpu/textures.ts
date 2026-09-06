export type TextureImageSource =
  | ImageBitmap
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageData
  | OffscreenCanvas
  | VideoFrame;

export type TextureImageSize = { width: number; height: number };

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

export function uploadExternalImageToTexture(
  device: GPUDevice,
  texture: GPUTexture,
  source: TextureImageSource,
  size: TextureImageSize = sourceSize(source),
): void {
  device.queue.copyExternalImageToTexture(
    { source } as unknown as GPUImageCopyExternalImage,
    { texture, premultipliedAlpha: true },
    [size.width, size.height],
  );
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
