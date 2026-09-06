import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import {
  effectiveLayerAlgorithm,
  featuresForLayer,
  sampleFeaturesAtTimes,
  videoClipStatus,
  videoLocalTimeSec,
} from "@/morph/model";
import { createProjectSpaceTransform } from "@/lib/viewport/projectSpace";
import { usePresentedFrame } from "@/morph/playback/usePresentedFrame";
import type { OverlayFrame } from "@/morph/overlay/overlayTransform";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore, type ImageSlot } from "@/store/projectStore";
import { PassthroughViewport } from "./PassthroughViewport";
import { MaskPaintLayer } from "./MaskPaintLayer";
import { OverlayCanvas } from "./OverlayCanvas";
import { HudLayer } from "./HudLayer";
import { buildPaneScene, type PaneGrids } from "./overlay/buildEditorScene";
import type { OverlayPalette } from "./overlay/resolveOverlayColors";
import { ViewportOverlayControls } from "./ViewportOverlayControls";
import { useSpaceHeld } from "./useSpaceHeld";
import { useHoverAnim } from "./useHoverAnim";
import { isTextTarget } from "./useKeyboardShortcuts";
import { ToolController } from "./tools/ToolController";
import { buildToolPointer } from "./tools/pointer";
import type { ToolContext } from "./tools/toolContext";
import { mergeScenes } from "./tools/toolHelpers";
import { useViewportGestures } from "./gesture/useViewportGestures";

/**
 * One side of the split editor: image + GPU feature overlay + all pointer
 * interaction. Interaction is delegated to a per-pane {@link ToolController}
 * (PRD M11 lot 2) — this component owns only the DOM (size, pointer capture,
 * redraw scheduling) and the projectSpace transform the tools hit-test/draw
 * against. The overlay scene is the data scene (features, grids) merged with the
 * active tool's transient draft/cursor primitives.
 */
export function FeaturePane({
  slot,
  label,
  dotClassName,
}: {
  slot: ImageSlot;
  label: string;
  dotClassName: string;
}) {
  // `t` is taken by the morph parameter selected from the store below.
  const { t: translate } = useTranslation();
  const side = slot === "source" ? "a" : "b";
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Hover lives in the store so BOTH panes highlight the corresponding handle.
  const hover = useEditorStore((s) => s.hover);
  const beaconBurst = useEditorStore((s) => s.beaconBurst);
  const hoveredId = hover?.featureId ?? null;
  const setHovered = useCallback(
    (id: string | null, handleKey: string | null = null) =>
      useEditorStore
        .getState()
        .setHover(id ? { featureId: id, handleKey, side } : null),
    [side],
  );
  // Bumped after pointer/keyboard events so the overlay redraws the live
  // draft/cursor even when no store data changed (rubber-band, push ring).
  const [cursorVersion, setCursorVersion] = useState(0);
  const bumpCursor = useCallback(() => setCursorVersion((v) => v + 1), []);

  const viewport = useEditorStore((s) => s.viewports[slot]);
  // Time-derived geometry tracks the PRESENTED frame (the decoded/uploaded one),
  // not the live store τ, so handles stay locked to the on-screen video frame
  // while scrubbing (PRD M10/M11).
  const { tauSec } = usePresentedFrame();
  const activeTool = useEditorStore((s) => s.activeTool);
  const chromeHidden = useEditorStore((s) => s.overlayChromeHidden);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const selection = useEditorStore((s) => s.selection);
  const overlays = useEditorStore((s) => s.viewportOverlays[slot]);
  const project = useProjectStore((s) => s.project);
  const video = useProjectStore((s) =>
    slot === "source" ? s.sourceVideo : s.targetVideo,
  );
  const activeLayer = useMemo(
    () => project?.layers.find((layer) => layer.id === activeLayerId),
    [activeLayerId, project],
  );
  const layerFeatures = useMemo(
    () =>
      project && activeLayer?.enabled && activeLayer.visible
        ? featuresForLayer(project, activeLayer)
        : [],
    [activeLayer, project],
  );
  const sourceTimeSec = project
    ? videoLocalTimeSec(project, "source", tauSec)
    : 0;
  const targetTimeSec = project
    ? videoLocalTimeSec(project, "target", tauSec)
    : 0;
  const hasTemporalMedia = Boolean(
    project?.videos?.source || project?.videos?.target,
  );
  const features = useMemo(
    () => sampleFeaturesAtTimes(layerFeatures, sourceTimeSec, targetTimeSec),
    [layerFeatures, sourceTimeSec, targetTimeSec],
  );
  const sideTimeSec = side === "a" ? sourceTimeSec : targetTimeSec;
  const videoStatus =
    project && video ? videoClipStatus(video.asset, tauSec) : "none";
  const activeLayerEditable =
    activeLayer !== undefined &&
    activeLayer.enabled &&
    activeLayer.visible &&
    !activeLayer.locked;
  const aspect = project ? project.canvas.width / project.canvas.height : 1;
  const effectiveAlgorithm =
    project && activeLayer
      ? effectiveLayerAlgorithm(project, activeLayer)
      : null;
  const meshSettings = project?.algorithmSettings.mesh ?? null;
  const showWireframe = effectiveAlgorithm === "mesh" && overlays.mesh;
  const tpsSettings = project?.algorithmSettings.thinPlateSpline ?? null;
  const showGrid =
    effectiveAlgorithm === "thin-plate-spline" && overlays.tpsGrid;
  const beierSettings = project?.algorithmSettings.beierNeely ?? null;
  const showBeierGrid =
    effectiveAlgorithm === "beier-neely" && overlays.beierField;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const transform = useMemo(
    () =>
      createProjectSpaceTransform(size.w || 1, size.h || 1, aspect, viewport),
    [size.w, size.h, aspect, viewport],
  );

  const gridsAt = useCallback(
    (presentedT: number): PaneGrids => ({
      mesh: showWireframe && meshSettings ? meshSettings : null,
      tps:
        showGrid && tpsSettings
          ? { settings: tpsSettings, tq: Math.round(presentedT * 256) / 256 }
          : null,
      beier:
        showBeierGrid && beierSettings
          ? { settings: beierSettings, t: presentedT }
          : null,
    }),
    [
      showWireframe,
      meshSettings,
      showGrid,
      tpsSettings,
      showBeierGrid,
      beierSettings,
    ],
  );

  const overlayFrame: OverlayFrame = {
    content: transform.content,
    cssWidth: size.w,
    cssHeight: size.h,
  };
  const showFeatures = overlays.features;
  const spaceHeld = useSpaceHeld();

  // Stable per-pane interaction controller (a plain value, lazily created once).
  const [controller] = useState(() => new ToolController());

  const primaryPointerRef = useRef<ReturnType<typeof buildToolPointer> | null>(
    null,
  );
  // Eased hover emphasis + beacon/burst clocks for overlay micro-animations.
  const {
    emphasisFor,
    getPulse,
    getBurstProgress,
    version: hoverVersion,
  } = useHoverAnim(hoveredId, beaconBurst);

  // Fresh per-render context handed to the controller on every call (pure data;
  // the controller stores no context of its own).
  const ctx = useMemo<ToolContext>(
    () => ({
      side,
      transform,
      features,
      activeLayerId,
      activeLayerEditable,
      showFeatures,
      hoveredId,
      hasTemporalMedia,
      sideTimeSec,
      spaceHeld,
      setHovered,
    }),
    [
      side,
      transform,
      features,
      activeLayerId,
      activeLayerEditable,
      showFeatures,
      hoveredId,
      hasTemporalMedia,
      sideTimeSec,
      spaceHeld,
      setHovered,
    ],
  );

  // Switch tools in an effect (the switch cancels the outgoing tool's draft).
  // activeTool is a buildScene dep, so the overlay rebuilds the new tool's scene.
  useEffect(() => {
    controller.setActiveTool(activeTool);
  }, [controller, activeTool]);

  // Enter finishes a polygonal draft, Escape cancels it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || isTextTarget(e.target)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        controller.commit();
        bumpCursor();
      } else if (e.key === "Escape") {
        e.preventDefault();
        controller.cancel();
        bumpCursor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, bumpCursor]);

  const pointer = (e: React.PointerEvent) =>
    buildToolPointer(e, ref.current!.getBoundingClientRect(), transform);
  const gestureHandlers = useViewportGestures<HTMLDivElement>({
    slot,
    getSize: () => ({ width: size.w, height: size.h }),
    getAspect: () => aspect,
    canDoubleReset: (event) =>
      event.pointerType === "touch" &&
      (activeTool === "select" || activeTool === "pan"),
    onPrimaryDown: (event) => {
      const toolPointer = pointer(event);
      primaryPointerRef.current = toolPointer;
      controller.pointerDown(toolPointer, ctx);
      if (controller.wantsCursor()) bumpCursor();
    },
    onPrimaryMove: (event) => {
      const toolPointer = pointer(event);
      primaryPointerRef.current = toolPointer;
      controller.pointerMove(toolPointer, ctx);
      if (controller.wantsCursor()) bumpCursor();
    },
    onHoverMove: (event) => {
      controller.pointerMove(pointer(event), ctx);
      if (controller.wantsCursor()) bumpCursor();
    },
    onPrimaryEnd: (event) => {
      controller.pointerUp(pointer(event), ctx);
      primaryPointerRef.current = null;
      bumpCursor();
    },
    onPinchStart: () => {
      if (primaryPointerRef.current) {
        controller.pointerUp(primaryPointerRef.current, ctx);
      }
      controller.cancel();
      primaryPointerRef.current = null;
      bumpCursor();
    },
    onPinchEnd: bumpCursor,
    onPointerLeave: () => {
      controller.pointerLeave(ctx);
      bumpCursor();
    },
  });

  const drafting = controller.hasDraft();
  // `cursorVersion` (bumped on every pointer/key event) forces this read of the
  // controller's draft flag to re-run so the commit/cancel buttons track it.
  void cursorVersion;

  const buildScene = useCallback(
    (palette: OverlayPalette, presented: { t: number; tauSec: number }) => {
      const presentedSourceTime = project
        ? videoLocalTimeSec(project, "source", presented.tauSec)
        : 0;
      const presentedTargetTime = project
        ? videoLocalTimeSec(project, "target", presented.tauSec)
        : 0;
      const presentedFeatures = sampleFeaturesAtTimes(
        layerFeatures,
        presentedSourceTime,
        presentedTargetTime,
      );
      const presentedCtx: ToolContext = {
        ...ctx,
        features: presentedFeatures,
        sideTimeSec: side === "a" ? presentedSourceTime : presentedTargetTime,
      };
      const burstProgress = getBurstProgress();
      const pane = buildPaneScene({
        side,
        features: presentedFeatures,
        showFeatures,
        selection,
        emphasisFor,
        hover: hover
          ? { featureId: hover.featureId, handleKey: hover.handleKey }
          : null,
        pulse: getPulse(),
        burst:
          beaconBurst && burstProgress !== null
            ? {
                featureId: beaconBurst.featureId,
                handleKeys: beaconBurst.handleKeys,
                progress: burstProgress,
              }
            : null,
        grids: gridsAt(presented.t),
        palette,
      });
      return mergeScenes(pane, controller.scene(palette, presentedCtx));
    },
    // activeTool + cursorVersion + hoverVersion force a rebuild for tool switches,
    // live draft/cursor changes and hover/beacon animation; ctx carries the tool inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      side,
      project,
      layerFeatures,
      showFeatures,
      selection,
      emphasisFor,
      hover,
      beaconBurst,
      getPulse,
      getBurstProgress,
      gridsAt,
      controller,
      ctx,
      activeTool,
      cursorVersion,
      hoverVersion,
    ],
  );

  const toolHud = controller.hud(ctx);

  return (
    <div
      ref={ref}
      {...assist(slot === "source" ? "pane.source" : "pane.target")}
      className={cn(
        // touch-none: the pane owns all touch gestures (pinch/pan/draw), so the
        // browser must not scroll/zoom the page underneath (PRD M12 lot 0).
        "@container/feature-view relative h-full w-full touch-none overflow-hidden",
        controller.cursor(ctx),
      )}
      {...gestureHandlers}
    >
      <PassthroughViewport
        texSlot={side}
        transform={transform}
        width={size.w}
        height={size.h}
      />
      {videoStatus !== "active" && videoStatus !== "none" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="rounded border border-border bg-background/85 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {videoStatus === "before"
              ? translate("preview.beforeClip")
              : videoStatus === "after"
                ? translate("preview.afterClip")
                : translate("preview.emptyClip")}
          </span>
        </div>
      )}
      {activeTool === "brush" && (
        <MaskPaintLayer transform={transform} width={size.w} height={size.h} />
      )}
      <OverlayCanvas frame={overlayFrame} build={buildScene} />
      <HudLayer
        side={side}
        features={showFeatures ? features : []}
        transform={transform}
        selection={selection}
        hoveredId={hoveredId}
        toolHud={toolHud}
      />
      {!chromeHidden && (
        <div
          title={label}
          className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded bg-background/70 px-1 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur @min-[8rem]/feature-view:px-2"
        >
          <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} />
          <span className="@min-[8rem]/feature-view:hidden">
            {side === "a" ? "A" : "B"}
          </span>
          <span className="hidden min-w-0 break-words @min-[8rem]/feature-view:block">
            {label}
          </span>
        </div>
      )}
      {!chromeHidden && <ViewportOverlayControls slot={slot} />}
      {drafting && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-2">
          <button
            type="button"
            aria-label={translate("studio.finishShape")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              controller.commit();
              bumpCursor();
            }}
            className={cn(
              "pointer-events-auto flex size-11 items-center justify-center rounded-full border border-border bg-background/90 text-primary shadow-lg backdrop-blur transition-colors hover:text-primary/80",
              FOCUS_RING,
            )}
          >
            <Check className="size-5" />
          </button>
          <button
            type="button"
            aria-label={translate("studio.cancelShape")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              controller.cancel();
              bumpCursor();
            }}
            className={cn(
              "pointer-events-auto flex size-11 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
