import { useEffect, useRef } from "react";
import {
  configureContext,
  createGpuContext,
  type GpuContext,
} from "@/morph/gpu/GpuContext";
import type { ProjectSpaceTransform } from "@/lib/viewport/projectSpace";
import { GLOBAL_LAYER_ID } from "@/morph/model";
import {
  ensureBrushEngine,
  getBrushEngine,
  subscribeBrush,
  syncBrushBase,
} from "@/morph/paint/brushPaintHost";
import { MaskTintRenderer } from "@/morph/paint/MaskTintRenderer";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { currentViewportBackingSize } from "@/lib/viewport/renderSurface";

/** Same hue as the compositor's contribution highlight, so "mask" reads alike. */
const TINT: readonly [number, number, number, number] = [0.14, 0.72, 1.0, 0.4];

/**
 * Live tint of the active layer's painted mask over a pane (PRD M11 lot 3),
 * mounted while the brush tool is active. Samples the shared BrushEngine's
 * display texture (committed ∘ in-progress stroke), so painting feedback is
 * immediate; the composite preview picks the mask up from the model on
 * pointer-up. Pointer-transparent, drawn under the gizmo overlay.
 */
export function MaskPaintLayer({
  transform,
  width,
  height,
}: {
  transform: ProjectSpaceTransform;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuContext | null>(null);
  const rendererRef = useRef<MaskTintRenderer | null>(null);
  const transformRef = useRef(transform);
  const sizeRef = useRef({ width, height });
  const renderNowRef = useRef<() => void>(() => {});

  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const paintedMask = useProjectStore(
    (s) => s.project?.layers.find((l) => l.id === activeLayerId)?.paintedMask,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let unsubscribe = () => {};

    const renderNow = () => {
      const gpu = gpuRef.current;
      const renderer = rendererRef.current;
      if (cancelled || !gpu || !renderer) return;
      const { width: w, height: h } = sizeRef.current;
      if (w === 0 || h === 0) return;
      const size = currentViewportBackingSize(
        w,
        h,
        useProjectStore.getState().project?.features.length ?? 0,
      );
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;

      const target = gpu.context.getCurrentTexture().createView();
      const engine = getBrushEngine();
      const view = engine?.maskView();
      const layerId = useEditorStore.getState().activeLayerId;
      if (
        !engine ||
        !view ||
        layerId === GLOBAL_LAYER_ID ||
        engine.baseLayerId() !== layerId
      ) {
        renderer.clear(target);
        return;
      }
      const { content } = transformRef.current;
      renderer.render(
        target,
        view,
        {
          x: content.x / w,
          y: content.y / h,
          width: content.width / w,
          height: content.height / h,
        },
        TINT,
      );
    };
    renderNowRef.current = renderNow;

    createGpuContext(canvas)
      .then((context) => {
        if (cancelled) return;
        configureContext(context);
        gpuRef.current = context;
        rendererRef.current = new MaskTintRenderer(
          context.device,
          context.format,
        );
        unsubscribe = subscribeBrush(renderNow);
        void ensureBrushEngine().then(() => {
          if (cancelled) return;
          syncBrushBase();
          renderNow();
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      gpuRef.current = null;
      // Device + BrushEngine are shared singletons — not disposed here.
    };
  }, []);

  // Layer switch or a committed stroke: re-sync the engine base and redraw.
  useEffect(() => {
    void ensureBrushEngine().then(() => {
      syncBrushBase();
      renderNowRef.current();
    });
  }, [activeLayerId, paintedMask]);

  // Keep latest transform/size in refs and redraw when zoom/pan/size changes.
  useEffect(() => {
    transformRef.current = transform;
    sizeRef.current = { width, height };
    renderNowRef.current();
  }, [transform, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 block h-full w-full"
    />
  );
}
