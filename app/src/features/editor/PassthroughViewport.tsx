import { useEffect, useRef } from "react";
import {
  configureContext,
  createGpuContext,
  type GpuContext,
} from "@/morph/gpu/GpuContext";
import {
  containRect,
  type ProjectSpaceTransform,
} from "@/lib/viewport/projectSpace";
import { PassthroughRenderer } from "@/morph/layers/PassthroughRenderer";
import {
  ensurePreviewEngine,
  getPreviewEngine,
  subscribePreview,
} from "@/morph/playback/previewEngineHost";
import {
  requestPreviewSync,
  startPreviewDriver,
} from "@/morph/playback/previewDriver";
import { currentViewportBackingSize } from "@/lib/viewport/renderSurface";
import { useProjectStore } from "@/store/projectStore";

/**
 * One side pane (source or target) rendered in WebGPU from the shared
 * PreviewEngine texture — the SAME texture the morph preview samples — so the
 * three viewports are frame-locked by construction (PRD M10). The feature
 * overlay / gizmos stay as SVG on top (FeaturePane); only the media surface
 * moved to WebGPU here.
 */
export function PassthroughViewport({
  texSlot,
  transform,
  width,
  height,
}: {
  texSlot: "a" | "b";
  transform: ProjectSpaceTransform;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuContext | null>(null);
  const rendererRef = useRef<PassthroughRenderer | null>(null);
  const transformRef = useRef(transform);
  const sizeRef = useRef({ width, height });
  const scheduleRenderRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let unsubscribe = () => {};
    let animationFrame: number | null = null;
    // Token of the last drawn frame (uploads + sizes + viewport); when it is
    // unchanged the canvas already shows this exact frame — skip the pass.
    let lastDrawKey: string | null = null;
    let lastDrawView: unknown = null;

    const clear = () => {
      const gpu = gpuRef.current;
      if (!gpu) return;
      const view = gpu.context.getCurrentTexture().createView();
      const encoder = gpu.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    };

    const renderNow = () => {
      const gpu = gpuRef.current;
      const renderer = rendererRef.current;
      if (cancelled || !gpu || !renderer) return;
      const { width: w, height: h } = sizeRef.current;
      const engine = getPreviewEngine();
      if (!engine || w === 0 || h === 0) {
        lastDrawKey = null;
        clear();
        return;
      }
      const slot = engine.slots()[texSlot];
      const size = currentViewportBackingSize(
        w,
        h,
        useProjectStore.getState().project?.features.length ?? 0,
      );
      const { content } = transformRef.current;
      const drawKey = `${size.width}x${size.height}|${w}x${h}|${content.x},${content.y},${content.width},${content.height}|${engine.uploadCounts()[texSlot]}`;
      if (drawKey === lastDrawKey && slot.view === lastDrawView) return;

      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;

      const inner = containRect(
        content.width,
        content.height,
        slot.width / slot.height,
      );
      renderer.render(
        gpu.context.getCurrentTexture().createView(),
        slot,
        {
          x: (content.x + inner.x) / w,
          y: (content.y + inner.y) / h,
          width: inner.width / w,
          height: inner.height / h,
        },
        {
          x: content.x / w,
          y: content.y / h,
          width: content.width / w,
          height: content.height / h,
        },
      );
      lastDrawKey = drawKey;
      lastDrawView = slot.view;
    };

    // Preview notifications arrive at pointer-event rate during a scrub;
    // coalesce to one draw per browser frame (last frame wins — renderNow
    // reads the engine's current slot at draw time).
    const scheduleRender = () => {
      if (cancelled || animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        renderNow();
      });
    };
    scheduleRenderRef.current = scheduleRender;

    createGpuContext(canvas)
      .then((context) => {
        if (cancelled) return;
        configureContext(context);
        gpuRef.current = context;
        rendererRef.current = new PassthroughRenderer(
          context.device,
          context.format,
        );
        startPreviewDriver();
        unsubscribe = subscribePreview(scheduleRender);
        void ensurePreviewEngine().then(() => {
          if (cancelled) return;
          requestPreviewSync();
          renderNow();
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      unsubscribe();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      gpuRef.current = null;
      // Device + PreviewEngine are shared singletons — not disposed here.
    };
  }, [texSlot]);

  // Keep latest transform/size in refs and redraw when zoom/pan or size changes.
  useEffect(() => {
    transformRef.current = transform;
    sizeRef.current = { width, height };
    scheduleRenderRef.current();
  }, [transform, width, height]);

  return (
    <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
  );
}
