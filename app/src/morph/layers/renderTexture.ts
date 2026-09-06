export type RenderTexture = {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
};

/** Reuses a render texture until its dimensions or owner change. */
export function syncRenderTexture(
  device: GPUDevice,
  current: RenderTexture | null,
  width: number,
  height: number,
  format: GPUTextureFormat,
): RenderTexture {
  if (current && current.width === width && current.height === height) {
    return current;
  }
  current?.texture.destroy();
  const texture = device.createTexture({
    size: [width, height],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  return { texture, view: texture.createView(), width, height };
}
