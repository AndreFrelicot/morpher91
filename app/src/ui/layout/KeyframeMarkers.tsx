import { useNumberFormatter } from "@/i18n/formatters";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  KEYFRAME_EPSILON_SEC,
  moveFeatureKeyframe,
  removeFeatureKeyframe,
  timelineDurationSec,
  type FeatureId,
  type FeaturePair,
  type TimelineSlot,
} from "@/morph/model";
import {
  beginEdit,
  cancelEdit,
  commitEdit,
} from "@/features/editor/featureCommit";
import { featureName } from "@/features/editor/featureName";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";
import { FOCUS_RING } from "@/ui/focusRing";
import {
  collectKeyframeMarkers,
  groupKeyframeMarkers,
  type KeyframeMarker,
} from "./keyframeMarkerModel";
import { pct } from "./timelineFormat";

/** Diamonds closer than this (px) are merged into a non-editable group. */
const GROUP_PX = 6;

/** Pointer travel (px) below which a press is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

type DragState = {
  featureId: FeatureId;
  side: "a" | "b";
  startX: number;
  fromLocalSec: number;
  currentLocalSec: number;
  moved: boolean;
};

const findFeature = (id: FeatureId): FeaturePair | undefined =>
  useProjectStore.getState().project?.features.find((f) => f.id === id);

/**
 * Keyframe diamonds of the selected features on a media track (M25). Side-a
 * keyframes sit on track A, side-b on track B, placed at the master τ where
 * the local video time is presented. The diamond under the playhead is filled.
 * Click jumps the playhead there; drag retimes the keyframe (frame-snapped,
 * one history step, Escape reverts); Alt-click deletes it. Diamonds too close
 * to tell apart collapse into a read-only group.
 */
export function KeyframeMarkers({
  slot,
  totalSec,
}: {
  slot: TimelineSlot;
  totalSec: number;
}) {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const project = useProjectStore((s) => s.project);
  const updateFeature = useProjectStore((s) => s.updateFeature);
  const selection = useEditorStore((s) => s.selection);
  const setTimelineTime = useEditorStore((s) => s.setTimelineTime);
  const tauSec = useFrameTauSec();
  const layerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [widthPx, setWidthPx] = useState(0);
  const [dragging, setDragging] = useState<FeatureId | null>(null);
  const side = slot === "source" ? "a" : "b";

  const markers = useMemo(
    () =>
      project
        ? collectKeyframeMarkers(project, selection, slot, featureName)
        : [],
    [project, selection, slot],
  );

  useEffect(() => {
    const element = layerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setWidthPx(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [markers.length]);

  // Escape reverts an in-flight drag.
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const drag = dragRef.current;
      if (event.key !== "Escape" || !drag) return;
      const feature = findFeature(drag.featureId);
      if (feature && drag.moved) {
        const patch = moveFeatureKeyframe(
          feature,
          drag.side,
          drag.currentLocalSec,
          drag.fromLocalSec,
        );
        if (patch) updateFeature(feature.id, patch);
      }
      cancelEdit();
      dragRef.current = null;
      suppressClickRef.current = true;
      setDragging(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dragging, updateFeature]);

  if (!project || markers.length === 0) return null;
  const video = project.videos?.[slot];
  // Still image: keyframes live in master τ over the whole timeline.
  const maxLocalSec = video ? video.durationSec : timelineDurationSec(project);
  const fps = Math.max(1, project.timeline.fps);
  // τ is frame-quantized: a keyframe is "under the playhead" within half a frame.
  const playheadTolerance = 0.5 / fps + KEYFRAME_EPSILON_SEC;
  const isSource = slot === "source";
  const groups = groupKeyframeMarkers(markers, totalSec, widthPx, GROUP_PX);

  const jump = (masterSec: number) =>
    setTimelineTime(masterSec, timelineDurationSec(project));

  const deleteMarker = (marker: KeyframeMarker) => {
    const editable = marker.features
      .map((entry) => findFeature(entry.id))
      .filter((f): f is FeaturePair => !!f && !f.locked);
    if (editable.length === 0) return;
    beginEdit();
    for (const feature of editable) {
      const patch = removeFeatureKeyframe(feature, side, marker.localSec);
      if (patch) updateFeature(feature.id, patch);
    }
    commitEdit();
  };

  const onMarkerPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    marker: KeyframeMarker,
  ) => {
    e.stopPropagation();
    if (e.altKey) {
      e.preventDefault();
      suppressClickRef.current = true;
      deleteMarker(marker);
      return;
    }
    if (e.button !== 0 || marker.features.length !== 1) return;
    const feature = findFeature(marker.features[0].id);
    if (!feature || feature.locked) return;
    try {
      layerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (synthetic event): move/up still reach the layer.
    }
    beginEdit();
    dragRef.current = {
      featureId: feature.id,
      side,
      startX: e.clientX,
      fromLocalSec: marker.localSec,
      currentLocalSec: marker.localSec,
      moved: false,
    };
    setDragging(feature.id);
  };

  const onLayerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const layer = layerRef.current;
    if (!drag || !layer) return;
    const width = layer.getBoundingClientRect().width;
    if (width <= 0) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const rawLocal = drag.fromLocalSec + (dx / width) * totalSec;
    const snapped = Math.round(rawLocal * fps) / fps;
    const toLocal = Math.min(maxLocalSec, Math.max(0, snapped));
    if (Math.abs(toLocal - drag.currentLocalSec) <= KEYFRAME_EPSILON_SEC)
      return;
    const feature = findFeature(drag.featureId);
    if (!feature) return;
    const patch = moveFeatureKeyframe(
      feature,
      drag.side,
      drag.currentLocalSec,
      toLocal,
    );
    if (!patch) return; // would land on another keyframe: keep the last valid spot
    updateFeature(feature.id, patch);
    drag.currentLocalSec = toLocal;
  };

  const onLayerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    try {
      layerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Capture can already be gone.
    }
    if (drag.moved) {
      commitEdit();
      suppressClickRef.current = true;
    } else {
      cancelEdit();
    }
    dragRef.current = null;
    setDragging(null);
  };

  const onMarkerClick = (masterSec: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    jump(masterSec);
  };

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-20"
      onPointerMove={onLayerPointerMove}
      onPointerUp={onLayerPointerUp}
      onPointerCancel={onLayerPointerUp}
    >
      {groups.map((group) => {
        if (group.markers.length > 1) {
          const first = group.markers[0];
          const last = group.markers[group.markers.length - 1];
          const title = t("timeline.keyframeGroupTitle", {
            count: group.markers.length,
            from: formatNumber(first.localSec, 2),
            to: formatNumber(last.localSec, 2),
          });
          const leftPct = (first.masterSec / Math.max(0.001, totalSec)) * 100;
          const rightPct = (last.masterSec / Math.max(0.001, totalSec)) * 100;
          return (
            <button
              key={`group-${first.localSec}`}
              type="button"
              title={title}
              aria-label={title}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMarkerClick(first.masterSec)}
              style={{
                left: `calc(${leftPct}% - ${GROUP_PX / 2}px)`,
                width: `calc(${Math.max(0, rightPct - leftPct)}% + ${GROUP_PX}px)`,
              }}
              className={cn(
                "pointer-events-auto absolute top-1/2 flex h-2 -translate-y-1/2 items-center justify-center rounded-sm border font-mono text-[8px] leading-none",
                FOCUS_RING,
                isSource
                  ? "border-image-a bg-image-a/70 text-background"
                  : "border-image-b bg-image-b/70 text-background",
              )}
            >
              {group.markers.length}
            </button>
          );
        }
        const marker = group.markers[0];
        const atPlayhead =
          Math.abs(marker.masterSec - tauSec) <= playheadTolerance;
        const editable =
          marker.features.length === 1 &&
          !findFeature(marker.features[0].id)?.locked;
        const isDragging =
          dragging !== null && marker.features[0].id === dragging;
        const title = t(
          editable ? "timeline.keyframeTitle" : "timeline.keyframeTitleShared",
          {
            time: formatNumber(marker.localSec, 2),
            names: marker.features.map((f) => f.name).join(", "),
          },
        );
        return (
          <button
            key={marker.localSec}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={atPlayhead}
            onPointerDown={(e) => onMarkerPointerDown(e, marker)}
            onClick={() => onMarkerClick(marker.masterSec)}
            style={{ left: pct(marker.masterSec, totalSec) }}
            className={cn(
              "pointer-events-auto absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border transition-transform hover:scale-125",
              FOCUS_RING,
              editable ? "cursor-ew-resize" : "cursor-pointer",
              isSource ? "border-image-a" : "border-image-b",
              atPlayhead || isDragging
                ? cn("scale-125", isSource ? "bg-image-a" : "bg-image-b")
                : "bg-background",
            )}
          />
        );
      })}
    </div>
  );
}
