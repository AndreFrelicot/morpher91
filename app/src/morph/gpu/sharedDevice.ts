export type SharedGpu = {
  adapter: GPUAdapter;
  device: GPUDevice;
  format: GPUTextureFormat;
};

/**
 * Single WebGPU adapter/device shared by every on-screen canvas (preview,
 * triple-view side panes, Compare grid). A device can back any number of
 * `GPUCanvasContext`s, and textures created on it can be sampled by all of
 * them — which is what lets the three viewports read the *same* `texA`/`texB`
 * and stay frame-locked (PRD M10). The export path keeps its own throwaway
 * device on purpose (offline, destroyed when done).
 *
 * Memoized: the first caller creates the device, the rest await the same
 * promise. On device loss the memo resets so the next acquire recreates it.
 */
let pending: Promise<SharedGpu> | null = null;
let current: SharedGpu | null = null;

/** Subscribers notified once when the shared device is lost (M12 lot 4). */
const lostListeners = new Set<() => void>();

/**
 * Subscribe to shared-device loss (memory pressure / driver reset on mobile).
 * The singleton cannot be transparently swapped under live canvas contexts, so
 * the UI surfaces a reload prompt rather than attempting an in-place recovery.
 */
export function onSharedDeviceLost(cb: () => void): () => void {
  lostListeners.add(cb);
  return () => lostListeners.delete(cb);
}

export async function getSharedGpu(): Promise<SharedGpu> {
  if (current) return current;
  if (pending) return pending;

  pending = (async () => {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      throw new Error("No compatible GPU adapter found.");
    }
    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();
    const gpu: SharedGpu = { adapter, device, format };

    void device.lost.then((info) => {
      if (current === gpu) current = null;
      // A deliberate destroy() (none for this singleton) reports "destroyed";
      // anything else is a real loss worth telling the user about.
      if (info.reason !== "destroyed") lostListeners.forEach((cb) => cb());
    });

    current = gpu;
    return gpu;
  })();

  try {
    return await pending;
  } catch (err) {
    pending = null;
    throw err;
  } finally {
    if (current) pending = null;
  }
}

/**
 * Acquires the shared device and configures `canvas`'s WebGPU context with it.
 * Each canvas owns its context; they all share the one device.
 */
export async function configureSharedCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<{ gpu: SharedGpu; context: GPUCanvasContext }> {
  const gpu = await getSharedGpu();
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) {
    throw new Error("Unable to create a WebGPU canvas context.");
  }
  context.configure({
    device: gpu.device,
    format: gpu.format,
    alphaMode: "premultiplied",
  });
  return { gpu, context };
}
