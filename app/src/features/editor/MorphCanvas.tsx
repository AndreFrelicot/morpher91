import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { StudioEmptyState } from "./StudioEmptyState";
import {
  configureContext,
  createGpuContext,
  type GpuContext,
} from "@/morph/gpu/GpuContext";
import {
  type MorphAlgorithmId,
  resolveTimelineFramePair,
  videoLocalTimeSec,
} from "@/morph/model";
import {
  createProjectSpaceTransform,
  type Rect,
} from "@/lib/viewport/projectSpace";
import { useViewportGestures } from "./gesture/useViewportGestures";
import { cn } from "@/lib/utils";
import { LayeredRenderer } from "@/morph/layers/LayeredRenderer";
import {
  ensurePreviewEngine,
  getPresentedFrame,
  getPreviewEngine,
  subscribePreview,
} from "@/morph/playback/previewEngineHost";
import {
  requestPreviewSync,
  startPreviewDriver,
} from "@/morph/playback/previewDriver";
import {
  liveBrushMaskView,
  subscribeBrush,
} from "@/morph/paint/brushPaintHost";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { isWebGPUSupported } from "@/lib/gpu/capabilities";
import { currentViewportBackingSize } from "@/lib/viewport/renderSurface";
import { WebGPUNotice } from "@/ui/components/WebGPUNotice";
import { LayerDebugControls } from "./LayerDebugControls";
import { LayerStackHud } from "./LayerStackHud";
import { PreviewMorphOverlay } from "./PreviewMorphOverlay";
import { PreviewOverlay } from "./PreviewOverlay";

/**
 * WebGPU morph preview. With a fixed `algorithm` prop it always renders that
 * algorithm for every layer (Compare view); otherwise it follows each layer's
 * algorithm override or the project default. Redraws imperatively on t /
 * features / images — no React re-render at 60fps.
 */
export function MorphCanvas({
  algorithm,
  showOverlays = true,
}: {
  algorithm?: MorphAlgorithmId;
  showOverlays?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const [webgpu] = useState(isWebGPUSupported);
  // Show a warmup spinner until the first frame paints — WebGPU pipeline
  // compilation can take 1–5s on a phone, and a black canvas reads as broken.
  const [preparing, setPreparing] = useState(true);

  const source = useProjectStore((s) => s.source);
  const target = useProjectStore((s) => s.target);
  const chromeHidden = useEditorStore((s) => s.overlayChromeHidden);
  const ready = source !== null && target !== null;

  // The studio preview (and the triple-view centre pane) follows the "preview"
  // viewport: wheel zoom, drag-to-pan, pinch, double-tap/click to reset. The
  // Compare grids pass showOverlays={false} and stay letterboxed.
  const zoomable = showOverlays;
  // Pane CSS size, kept fresh by measure (the effect's ResizeObserver).
  const cssSizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<{
    id: number;
    start: { x: number; y: number };
    pan: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gpu: GpuContext | null = null;
    let renderer: LayeredRenderer | null = null;
    let unsubscribe = () => {};
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame: number | null = null;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      cssSizeRef.current = { w: rect.width, h: rect.height };
    };

    // Resizing the backing store blanks a WebGPU canvas until the next
    // present, so it only happens right before a draw. Doing it from the
    // ResizeObserver alone (which runs after this frame's rAF) would paint an
    // empty canvas on every frame of a panel transition.
    const fitBackingStore = () => {
      const { w, h } = cssSizeRef.current;
      const size = currentViewportBackingSize(
        w,
        h,
        useProjectStore.getState().project?.features.length ?? 0,
      );
      if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width;
        canvas.height = size.height;
      }
    };

    const clear = (finishWarmup = true) => {
      if (!gpu) return;
      const view = gpu.context.getCurrentTexture().createView();
      if (renderer) {
        renderer.clear(view, "black");
        if (!cancelled && finishWarmup) setPreparing(false);
        return;
      }

      // Defensive startup fallback before the renderer facade is constructed.
      const encoder = gpu.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
      if (!cancelled && finishWarmup) setPreparing(false);
    };

    // Synchronous: the preview driver has already uploaded the shared A/B
    // textures, so the morph just samples the engine's current slots. Every
    // viewport renders from the same textures at the same τ (PRD M10).
    const renderNow = () => {
      if (cancelled || !gpu || !renderer) return;
      // A draw scheduled for the next frame is satisfied by this one.
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      fitBackingStore();
      const engine = getPreviewEngine();
      const project = useProjectStore.getState().project;
      if (!project) {
        clear();
        return;
      }
      if (!engine) {
        clear(false);
        return;
      }
      const editor = useEditorStore.getState();
      // Warp at the PRESENTED frame's τ/t — the one whose textures are uploaded —
      // so the morph geometry is locked to the visible frame, not the live store
      // τ that runs ahead of the async video decode (PRD M10/M11).
      const { tauSec, t } = getPresentedFrame();
      const sourceTimeSec = videoLocalTimeSec(project, "source", tauSec);
      const targetTimeSec = videoLocalTimeSec(project, "target", tauSec);
      const framePair = resolveTimelineFramePair(
        project,
        tauSec,
        engine.slots(),
      );
      if (!framePair) {
        clear();
        return;
      }
      const debugMaskFeature =
        editor.layerDebugMode === "layer-mask" && editor.selection.length === 1
          ? project.features.find(
              (feature) =>
                feature.id === editor.selection[0] &&
                feature.kind === "region" &&
                feature.enabled,
            )
          : undefined;
      // While the brush tool is active, composite with the brush session's
      // live mask so painting updates the preview during the stroke, not only
      // on pointer-up.
      const liveMask =
        editor.activeTool === "brush"
          ? liveBrushMaskView(editor.activeLayerId)
          : null;
      // Zoomed/panned project content box, mapped from CSS px to backing px.
      // Omitted at the default viewport so export/compare keep the exact
      // letterbox math.
      let contentRect: Rect | undefined;
      const { w: cssW, h: cssH } = cssSizeRef.current;
      const view = editor.viewports.preview;
      if (
        zoomable &&
        cssW > 0 &&
        cssH > 0 &&
        (view.zoom !== 1 || view.pan.x !== 0 || view.pan.y !== 0)
      ) {
        const { content } = createProjectSpaceTransform(
          cssW,
          cssH,
          project.canvas.width / project.canvas.height,
          view,
        );
        const sx = canvas.width / cssW;
        const sy = canvas.height / cssH;
        contentRect = {
          x: content.x * sx,
          y: content.y * sy,
          width: content.width * sx,
          height: content.height * sy,
        };
      }
      renderer.renderFrame(
        {
          target: gpu.context.getCurrentTexture().createView(),
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          contentRect,
          a: framePair.a,
          b: framePair.b,
          t,
          tauSec,
          sourceTimeSec,
          targetTimeSec,
          project,
        },
        {
          algorithm,
          debugMode: showOverlays ? editor.layerDebugMode : undefined,
          debugLayerId: showOverlays ? editor.activeLayerId : undefined,
          debugMaskFeatureId: showOverlays ? debugMaskFeature?.id : undefined,
          livePaintedMask: liveMask
            ? { layerId: editor.activeLayerId, view: liveMask }
            : undefined,
        },
      );
      setPreparing(false);
    };

    // Preview notifications can arrive at pointer-event rate (~120 Hz on a
    // trackpad). Coalesce them into one draw per browser frame; renderNow
    // reads the latest presented frame at draw time, so the last τ wins.
    const scheduleRender = () => {
      if (cancelled || animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        renderNow();
      });
    };

    createGpuContext(canvas)
      .then((context) => {
        if (cancelled) {
          return;
        }
        configureContext(context);
        gpu = context;
        renderer = new LayeredRenderer(context.device, context.format);
        measure();

        startPreviewDriver();
        const unsubFrame = subscribePreview(scheduleRender);
        // Live brush feedback: every stroke extension redraws the composite.
        const unsubBrush = subscribeBrush(scheduleRender);
        const unsubEditor = useEditorStore.subscribe((s, prev) => {
          if (
            s.layerDebugMode !== prev.layerDebugMode ||
            s.activeLayerId !== prev.activeLayerId ||
            s.activeTool !== prev.activeTool ||
            s.selection !== prev.selection ||
            (zoomable && s.viewports !== prev.viewports)
          ) {
            scheduleRender();
          }
        });
        const unsubProject = useProjectStore.subscribe((s, prev) => {
          if (
            s.source !== prev.source ||
            s.target !== prev.target ||
            s.sourceVideo !== prev.sourceVideo ||
            s.targetVideo !== prev.targetVideo ||
            s.project !== prev.project ||
            s.activeAlgorithm !== prev.activeAlgorithm
          ) {
            scheduleRender();
          }
        });
        unsubscribe = () => {
          unsubFrame();
          unsubBrush();
          unsubEditor();
          unsubProject();
        };

        // Draw synchronously: the observer runs before this frame paints, so
        // the pane follows an animated panel without a blank or lagging frame.
        resizeObserver = new ResizeObserver(() => {
          measure();
          renderNow();
        });
        resizeObserver.observe(canvas);

        // Ensure the shared engine exists, push an initial sync and draw the
        // poster slots so the first paint is not blank.
        void ensurePreviewEngine().then(() => {
          if (cancelled) return;
          requestPreviewSync();
          renderNow();
        });
      })
      .catch((err: unknown) => {
        if (cancelled || !errorRef.current) return;
        errorRef.current.textContent =
          err instanceof Error ? err.message : String(err);
        errorRef.current.hidden = false;
      });

    return () => {
      cancelled = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      unsubscribe();
      resizeObserver?.disconnect();
      renderer?.dispose();
      // Device + PreviewEngine are shared singletons — not disposed here.
    };
  }, [algorithm, showOverlays, zoomable]);

  // Gestures start only on the canvas itself, so HUD controls keep their clicks.
  const gestureHandlers = useViewportGestures<HTMLDivElement>({
    slot: "preview",
    enabled: zoomable,
    getSize: () => ({
      width: cssSizeRef.current.w,
      height: cssSizeRef.current.h,
    }),
    getAspect: () => {
      const project = useProjectStore.getState().project;
      return project ? project.canvas.width / project.canvas.height : 1;
    },
    acceptPointer: (event) =>
      event.target === canvasRef.current &&
      useProjectStore.getState().project !== null,
    acceptWheel: (event) => event.target === canvasRef.current,
    onPrimaryDown: (event, point) => {
      dragRef.current = {
        id: event.pointerId,
        start: point,
        pan: { ...useEditorStore.getState().viewports.preview.pan },
      };
    },
    onPrimaryMove: (event, point) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.id) return;
      useEditorStore.getState().setViewport("preview", {
        pan: {
          x: drag.pan.x + (point.x - drag.start.x),
          y: drag.pan.y + (point.y - drag.start.y),
        },
      });
    },
    onPrimaryEnd: () => {
      dragRef.current = null;
    },
    onPinchStart: () => {
      dragRef.current = null;
    },
  });

  if (!webgpu) return <WebGPUNotice />;

  return (
    <div
      className="@container/morph-view relative h-full w-full touch-none"
      {...gestureHandlers}
    >
      <canvas
        ref={canvasRef}
        className={cn("block h-full w-full", zoomable && "cursor-grab")}
      />
      {showOverlays && <PreviewOverlay />}
      {showOverlays && <PreviewMorphOverlay />}
      {showOverlays && ready && !chromeHidden && <LayerDebugControls />}
      {showOverlays && ready && !chromeHidden && <LayerStackHud />}

      {!ready && showOverlays && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.24_0.018_266),var(--background))]">
          <StudioEmptyState />
        </div>
      )}

      {!ready && !showOverlays && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            <Trans
              i18nKey="studio.importPrompt"
              components={{
                a: <span className="text-image-a" />,
                b: <span className="text-image-b" />,
              }}
            />
          </p>
        </div>
      )}

      {ready && preparing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <span className="size-6 rounded-full border-2 border-muted-foreground/30 border-t-foreground motion-safe:animate-spin" />
          <p className="text-xs">{t("studio.preparingGpu")}</p>
        </div>
      )}

      <div
        ref={errorRef}
        hidden
        role="alert"
        className="absolute inset-0 flex items-center justify-center bg-background/80 p-6 text-center text-sm text-red-400"
      />
    </div>
  );
}
