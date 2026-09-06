import proxyBlitWgsl from "./proxyBlit.wgsl?raw";

/**
 * GPU downscale of decoded `VideoFrame`s into proxy textures (M23). The frame
 * is bound as an external texture (zero-copy from the decoder's surface where
 * the browser allows it) and drawn through a linear sampler onto the smaller
 * render target — about a millisecond per frame, versus ~6 ms for a
 * `createImageBitmap` resize.
 */
export class ProxyBlitter {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly bindGroupLayout: GPUBindGroupLayout;

  constructor(device: GPUDevice) {
    this.device = device;
    const module = device.createShaderModule({ code: proxyBlitWgsl });
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          externalTexture: {},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format: "rgba8unorm" }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
  }

  /** Creates a proxy render target of the given size. */
  createTarget(width: number, height: number): GPUTexture {
    return this.device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  /** Draws `frame` scaled into `target`. Must be called synchronously with a
   * live frame: external textures expire at the end of the current task. */
  blit(frame: VideoFrame, target: GPUTexture): void {
    const external = this.device.importExternalTexture({ source: frame });
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: external },
        { binding: 1, resource: this.sampler },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
