import { getSharedGpu } from "./sharedDevice";

export type GpuContext = {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
};

/**
 * Acquires the shared WebGPU device (PRD M10 §"GPUDevice partagé") and a context
 * for `canvas`. Throws with an explicit message when WebGPU, an adapter, or the
 * canvas context is unavailable (PRD §11.1, §21.1).
 *
 * The device is shared across every on-screen canvas — callers must NOT destroy
 * it on teardown (see {@link getSharedGpu}). Does NOT configure the context: the
 * caller calls {@link configureContext} only for the init it actually keeps, so
 * a stale (cancelled) init cannot reconfigure the active one under StrictMode.
 */
export async function createGpuContext(
  canvas: HTMLCanvasElement,
): Promise<GpuContext> {
  const { adapter, device, format } = await getSharedGpu();

  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("Unable to create a WebGPU canvas context.");
  }

  return { adapter, device, context, format };
}

export function configureContext(gpu: GpuContext): void {
  gpu.context.configure({
    device: gpu.device,
    format: gpu.format,
    alphaMode: "premultiplied",
  });
}
