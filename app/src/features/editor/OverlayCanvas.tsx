import { useEffect, useRef } from "react";
import {
  configureContext,
  createGpuContext,
  type GpuContext,
} from "@/morph/gpu/GpuContext";
import { OverlayRenderer } from "@/morph/overlay/OverlayRenderer";
import type { OverlayFrame } from "@/morph/overlay/overlayTransform";
import type { OverlayScene } from "@/morph/overlay/scene";
import type { FrameContext } from "@/morph/playback/PreviewEngine";
import {
  getPresentedFrame,
  subscribePreview,
} from "@/morph/playback/previewEngineHost";
import { startPreviewDriver } from "@/morph/playback/previewDriver";
import {
  resolveOverlayColors,
  type OverlayPalette,
} from "./overlay/resolveOverlayColors";
import { currentViewportBackingSize } from "@/lib/viewport/renderSurface";
import { useProjectStore } from "@/store/projectStore";

/**
 * Transparent WebGPU canvas drawing one viewport's interaction overlay (PRD M11),
 * on the shared M10 device — replacing the SVG overlays. The caller supplies a
 * {@link OverlayFrame} (project content box + canvas size, from the SAME
 * projectSpace transform the panes/hit-test use) and a
 * `build(palette, presentedFrame)` that produces the scene. Preview notifications
 * and React prop updates are coalesced into one browser frame, so the renderer
 * never draws once with stale props and then immediately again with fresh ones.
 * Pointer-transparent: the parent pane owns hit-testing.
 */
export function OverlayCanvas({
  frame,
  build,
}: {
  frame: OverlayFrame;
  build: (palette: OverlayPalette, presented: FrameContext) => OverlayScene;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuContext | null>(null);
  const rendererRef = useRef<OverlayRenderer | null>(null);
  const paletteRef = useRef<OverlayPalette | null>(null);
  const buildRef = useRef(build);
  const frameRef = useRef(frame);
  const scheduleDrawRef = useRef<(presented?: FrameContext) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let unsubscribe = () => {};
    let animationFrame: number | null = null;
    let presented = getPresentedFrame();

    const draw = () => {
      const gpu = gpuRef.current;
      const renderer = rendererRef.current;
      const palette = paletteRef.current;
      if (cancelled || !gpu || !renderer || !palette) return;
      const f = frameRef.current;
      const size = currentViewportBackingSize(
        f.cssWidth,
        f.cssHeight,
        useProjectStore.getState().project?.features.length ?? 0,
      );
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      if (f.cssWidth === 0 || f.cssHeight === 0) return;
      renderer.render(
        gpu.context.getCurrentTexture().createView(),
        buildRef.current(palette, presented),
        f,
      );
    };
    const scheduleDraw = (nextPresented = getPresentedFrame()) => {
      presented = nextPresented;
      if (animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        draw();
      });
    };
    scheduleDrawRef.current = scheduleDraw;

    createGpuContext(canvas)
      .then((context) => {
        if (cancelled) return;
        configureContext(context);
        gpuRef.current = context;
        rendererRef.current = new OverlayRenderer(
          context.device,
          context.format,
        );
        paletteRef.current = resolveOverlayColors();
        startPreviewDriver();
        unsubscribe = subscribePreview(scheduleDraw);
        scheduleDraw();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      unsubscribe();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      gpuRef.current = null;
      // Device is a shared singleton — not destroyed here.
    };
  }, []);

  // Keep the latest scene inputs in refs. Scheduling instead of drawing now lets
  // a preview notification and the ensuing React commit collapse into one pass.
  useEffect(() => {
    buildRef.current = build;
    frameRef.current = frame;
    scheduleDrawRef.current();
  }, [build, frame]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 block h-full w-full"
    />
  );
}
