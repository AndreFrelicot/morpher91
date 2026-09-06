import { layerName } from "@/features/editor/layerName";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  StepBack,
  StepForward,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { useEditorStore } from "@/store/editorStore";
import {
  stepTimelineFrame,
  toggleTimelinePlayback,
} from "@/morph/playback/timelineTransport";
import { hasMissingProjectVideos, useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";
import {
  GLOBAL_LAYER_ID,
  MIN_VIDEO_CLIP_DURATION_SEC,
  layerClipForProject,
  normalizeVideoTimeline,
  sortLayers,
  timelineDurationSec,
  transitionAtProgress,
  type LayerTimelineClip,
  type LayerTiming,
  type MorphLayer,
  type TimelineSlot,
  PROJECT_LIMITS,
  imageTimelineForProject,
  videoFrameAvailableAt,
  type VideoTimeline,
} from "@/morph/model";
import {
  ACTION_ARIA_SHORTCUTS,
  ACTION_SHORTCUT_LABELS,
  tooltipWithShortcut,
} from "@/features/editor/useKeyboardShortcuts";
import { FOCUS_RING } from "@/ui/focusRing";
import { KeyframeMarkers } from "./KeyframeMarkers";
import { PlaybackRuler } from "./PlaybackRuler";
import { PreviewSyncIndicator } from "./PreviewSyncIndicator";
import { clamp, formatTimecode, pct } from "./timelineFormat";

const MIN_LAYER_DURATION_SEC = 0.1;
/** Layer rows shown before the layer track area starts scrolling. */
const MAX_VISIBLE_LAYER_ROWS = 6;
const LAYER_ROW_PX = 24;
type DragState = {
  layerId: string;
  mode: "move" | "start" | "end";
  startX: number;
  initialTotalSec: number;
  initial: LayerTimelineClip;
};

type TimelineMedia = {
  name: string;
  timeline: VideoTimeline;
  sourceDurationSec: number | null;
};

type MediaDragState = {
  slot: TimelineSlot;
  mode: "move" | "start" | "end";
  startX: number;
  initialTotalSec: number;
  initial: VideoTimeline;
  durationSec: number | null;
};

type TimelineDragState =
  | ({ kind: "layer" } & DragState)
  | ({ kind: "media" } & MediaDragState);

/* Layer clip palette from the studio redesign: gold first (masked layers),
   then indigo/mint/cyan/coral/purple, all tinted onto the dark lane. */
const LAYER_TRACK_COLORS = [
  {
    background: "rgba(230, 200, 106, 0.14)",
    border: "rgba(230, 200, 106, 0.5)",
    text: "#e6c86a",
  },
  {
    background: "rgba(139, 147, 248, 0.14)",
    border: "rgba(139, 147, 248, 0.5)",
    text: "#b9befc",
  },
  {
    background: "rgba(99, 230, 176, 0.13)",
    border: "rgba(99, 230, 176, 0.5)",
    text: "#a3f0cf",
  },
  {
    background: "rgba(76, 195, 232, 0.13)",
    border: "rgba(76, 195, 232, 0.5)",
    text: "#9fd8ec",
  },
  {
    background: "rgba(240, 135, 111, 0.13)",
    border: "rgba(240, 135, 111, 0.5)",
    text: "#f3b3a3",
  },
  {
    background: "rgba(192, 132, 252, 0.14)",
    border: "rgba(192, 132, 252, 0.5)",
    text: "#ddc7fd",
  },
];

function layerTrackColor(index: number) {
  return LAYER_TRACK_COLORS[index % LAYER_TRACK_COLORS.length];
}

function parseTimecode(value: string, fps: number): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const safeFps = Math.max(1, Math.round(fps));
  if (!trimmed.includes(":")) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  }
  const [secondsPart, framesPart] = trimmed.split(":");
  if (framesPart === undefined || trimmed.split(":").length !== 2) return null;
  const seconds = Number(secondsPart);
  const frames = Number(framesPart);
  if (!Number.isFinite(seconds) || !Number.isFinite(frames)) return null;
  return (
    Math.max(0, seconds) + clamp(Math.trunc(frames), 0, safeFps - 1) / safeFps
  );
}

function TrackBlock({
  label,
  startSec,
  durationSec,
  totalSec,
  timing,
  title,
  className,
  style,
  onMovePointerDown,
  onSelect,
  ariaLabel,
  children,
}: {
  label: string;
  startSec: number;
  durationSec: number;
  totalSec: number;
  /** Layer transition windows, drawn read-only over the block. */
  timing?: LayerTiming;
  /** Tooltip; defaults to the label. */
  title?: string;
  className: string;
  style?: React.CSSProperties;
  onMovePointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSelect?: () => void;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`absolute top-0 h-5 overflow-hidden rounded border font-mono text-[10px] leading-5 ${className}`}
      style={{
        left: pct(startSec, totalSec),
        width: pct(Math.max(0.001, durationSec), totalSec),
        ...style,
      }}
      title={title ?? label}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      onPointerDown={onMovePointerDown}
    >
      <span className="pointer-events-none relative z-[1] block truncate px-2">
        {label}
      </span>
      {timing && <TransitionWindows timing={timing} />}
      {children}
    </div>
  );
}

/**
 * Where the crossfade actually happens inside a clip (PRD §9.2): the block is
 * dimmed outside the dissolve window, so the lit part is where A fades into
 * B, and the warp window runs as a bar along the top edge. Default 0..1
 * windows draw no dimming — only the easing curve.
 */
function TransitionWindows({ timing }: { timing: LayerTiming }) {
  const { warpStart, warpEnd, dissolveStart, dissolveEnd } = timing;
  const narrowed =
    warpStart > 0 || warpEnd < 1 || dissolveStart > 0 || dissolveEnd < 1;
  const window = (start: number, end: number) => ({
    left: `${start * 100}%`,
    width: `${Math.max(0, end - start) * 100}%`,
  });
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {narrowed && (
        <>
          <span
            className="absolute inset-y-0 bg-background/60"
            style={window(0, dissolveStart)}
          />
          <span
            className="absolute inset-y-0 bg-background/60"
            style={window(dissolveEnd, 1)}
          />
          <span
            className="absolute inset-y-0 border-x border-current opacity-60"
            style={window(dissolveStart, dissolveEnd)}
          />
          <span
            className="absolute top-0 h-0.5 bg-current opacity-80"
            style={window(warpStart, warpEnd)}
          />
        </>
      )}
      <TransitionCurve timing={timing} />
    </span>
  );
}

const CURVE_SAMPLES = 48;

/**
 * The layer's dissolve progress over its clip, drawn as a curve: flat before
 * the dissolve window, rising through it with the easing, flat after. The
 * warp progress is dashed behind it whenever it differs.
 */
function TransitionCurve({ timing }: { timing: LayerTiming }) {
  const { dissolve, warp, distinct } = useMemo(() => {
    const dissolvePoints: string[] = [];
    const warpPoints: string[] = [];
    let distinct = false;
    for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
      const progress = i / CURVE_SAMPLES;
      const { warpT, dissolveT } = transitionAtProgress(timing, progress);
      const x = progress * 100;
      dissolvePoints.push(`${x},${(1 - dissolveT) * 100}`);
      warpPoints.push(`${x},${(1 - warpT) * 100}`);
      if (Math.abs(warpT - dissolveT) > 0.005) distinct = true;
    }
    return {
      dissolve: dissolvePoints.join(" "),
      warp: warpPoints.join(" "),
      distinct,
    };
  }, [timing]);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-[3px] h-[calc(100%-6px)] w-full overflow-visible"
    >
      {distinct && (
        <polyline
          points={warp}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
          opacity={0.45}
        />
      )}
      <polyline
        points={dissolve}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
    </svg>
  );
}

function TimecodeInput({
  label,
  valueSec,
  minSec = 0,
  maxSec,
  fps,
  onCommit,
}: {
  label: string;
  valueSec: number;
  minSec?: number;
  maxSec: number;
  fps: number;
  onCommit: (sec: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const cancelCommit = useRef(false);
  const displayValue = focused ? draft : formatTimecode(valueSec, fps);

  const commit = () => {
    const parsed = parseTimecode(draft, fps);
    if (parsed === null) return;
    onCommit(clamp(parsed, minSec, maxSec));
  };

  return (
    <label className="flex items-center gap-1">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!cancelCommit.current) commit();
          cancelCommit.current = false;
          setFocused(false);
        }}
        onFocus={() => {
          cancelCommit.current = false;
          setDraft(formatTimecode(valueSec, fps));
          setFocused(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelCommit.current = true;
            e.currentTarget.blur();
          }
        }}
        aria-label={t("timeline.timecodeAria", { label })}
        title={t("timeline.timecodeTitle", { label })}
        className="w-16 select-text rounded border border-border bg-background px-1 py-0.5 text-right font-mono"
      />
    </label>
  );
}

export function TimelineDock() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const mediaMissing = useProjectStore(hasMissingProjectVideos);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const updateVideoTimeline = useProjectStore((s) => s.updateVideoTimeline);
  const updateImageTimeline = useProjectStore((s) => s.updateImageTimeline);
  // Quantized to the display step (one video frame): during a scrub the dock
  // re-renders once per frame shown, not once per pointer event.
  const tauSec = useFrameTauSec();
  const playing = useEditorStore((s) => s.playing);
  const setTimelineTime = useEditorStore((s) => s.setTimelineTime);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const timelineOpen = useEditorStore((s) => s.panelsOpen.timeline);
  const setPanelOpen = useEditorStore((s) => s.setPanelOpen);
  const [selectedMediaSlot, setSelectedMediaSlot] =
    useState<TimelineSlot | null>(null);
  const [selectedMediaLayerId, setSelectedMediaLayerId] = useState<
    string | null
  >(null);
  const durationSec = timelineDurationSec(project);
  const fps = project?.timeline.fps ?? 30;
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<TimelineDragState | null>(null);

  // Playback advances τ through the shared PreviewEngine clock (previewDriver),
  // pinned to real decoded frames — not a local rAF accumulator (PRD M10).

  useEffect(() => {
    if (tauSec > durationSec) setTimelineTime(durationSec, durationSec);
  }, [durationSec, setTimelineTime, tauSec]);

  const updateClip = (layerId: string, clip: LayerTimelineClip) => {
    updateLayer(layerId, {
      clip: {
        ...clip,
        startSec: Math.max(0, clip.startSec),
        durationSec: Math.max(MIN_LAYER_DURATION_SEC, clip.durationSec),
      },
    });
  };

  const beginLayerDrag = (
    e: React.PointerEvent,
    layer: MorphLayer,
    mode: DragState["mode"],
  ) => {
    if (!project || layer.id === GLOBAL_LAYER_ID) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedMediaSlot(null);
    setActiveLayer(layer.id);
    drag.current = {
      kind: "layer",
      layerId: layer.id,
      mode,
      startX: e.clientX,
      initialTotalSec: durationSec,
      initial: layerClipForProject(project, layer),
    };
    trackRef.current?.setPointerCapture(e.pointerId);
  };

  const updateMediaClip = (slot: TimelineSlot, clip: VideoTimeline) => {
    const video = project?.videos?.[slot];
    if (video)
      updateVideoTimeline(
        slot,
        normalizeVideoTimeline(clip, video.durationSec),
      );
    else
      updateImageTimeline(slot, {
        startSec: clip.startSec,
        durationSec: clip.durationSec,
      });
  };

  const beginMediaDrag = (
    e: React.PointerEvent,
    slot: TimelineSlot,
    media: TimelineMedia,
    mode: MediaDragState["mode"],
  ) => {
    if (!project) return;
    e.stopPropagation();
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setSelectedMediaSlot(slot);
    setSelectedMediaLayerId(activeLayerId);
    drag.current = {
      kind: "media",
      slot,
      mode,
      startX: e.clientX,
      initialTotalSec: durationSec,
      initial: media.timeline,
      durationSec: media.sourceDurationSec,
    };
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!project || !drag.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const deltaSec =
      rect.width > 0
        ? ((e.clientX - drag.current.startX) / rect.width) *
          drag.current.initialTotalSec
        : 0;
    if (drag.current.kind === "media") {
      const {
        initial,
        mode,
        slot,
        durationSec: mediaDurationSec,
      } = drag.current;
      const start = initial.startSec;
      const end = initial.startSec + initial.durationSec;
      if (mediaDurationSec === null) {
        const limit = PROJECT_LIMITS.timelineDurationSec;
        if (mode === "move") {
          updateMediaClip(slot, {
            ...initial,
            startSec: clamp(start + deltaSec, 0, limit - initial.durationSec),
          });
        } else if (mode === "start") {
          const nextStart = clamp(
            start + deltaSec,
            0,
            end - MIN_VIDEO_CLIP_DURATION_SEC,
          );
          updateMediaClip(slot, {
            ...initial,
            startSec: nextStart,
            durationSec: end - nextStart,
          });
        } else {
          updateMediaClip(slot, {
            ...initial,
            durationSec: clamp(
              initial.durationSec + deltaSec,
              MIN_VIDEO_CLIP_DURATION_SEC,
              limit - start,
            ),
          });
        }
        return;
      }
      if (mode === "move") {
        const nextStart = clamp(
          start + deltaSec,
          0,
          Math.max(0, durationSec - initial.durationSec),
        );
        updateMediaClip(slot, { ...initial, startSec: nextStart });
      } else if (mode === "start") {
        const minDuration = Math.min(
          MIN_VIDEO_CLIP_DURATION_SEC,
          Math.max(0, mediaDurationSec - initial.inSec),
        );
        const actualDelta = clamp(
          deltaSec,
          Math.max(-start, -initial.inSec),
          Math.min(initial.durationSec - minDuration, durationSec - start),
        );
        const nextStart = start + actualDelta;
        const nextIn = initial.inSec + actualDelta;
        updateMediaClip(slot, {
          ...initial,
          startSec: nextStart,
          inSec: nextIn,
          durationSec: end - nextStart,
        });
      } else {
        const nextDuration = clamp(
          initial.durationSec + deltaSec,
          MIN_VIDEO_CLIP_DURATION_SEC,
          Math.min(
            Math.max(0, mediaDurationSec - initial.inSec),
            Math.max(MIN_VIDEO_CLIP_DURATION_SEC, durationSec - start),
          ),
        );
        updateMediaClip(slot, { ...initial, durationSec: nextDuration });
      }
      return;
    }

    const { initial, mode, layerId } = drag.current;
    const start = initial.startSec;
    const end = initial.startSec + initial.durationSec;

    if (mode === "move") {
      const nextStart = clamp(
        start + deltaSec,
        0,
        Math.max(0, durationSec - initial.durationSec),
      );
      updateClip(layerId, { ...initial, startSec: nextStart });
    } else if (mode === "start") {
      const nextStart = clamp(
        start + deltaSec,
        0,
        end - MIN_LAYER_DURATION_SEC,
      );
      updateClip(layerId, {
        ...initial,
        startSec: nextStart,
        durationSec: end - nextStart,
      });
    } else {
      const nextEnd = clamp(
        end + deltaSec,
        start + MIN_LAYER_DURATION_SEC,
        durationSec,
      );
      updateClip(layerId, { ...initial, durationSec: nextEnd - start });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget instanceof HTMLElement) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture can already be released by the browser.
      }
    }
  };

  const mediaForSlot = (slot: TimelineSlot): TimelineMedia | undefined => {
    if (!project) return undefined;
    const video = project.videos?.[slot];
    if (video)
      return {
        name: video.name,
        timeline: normalizeVideoTimeline(video.timeline, video.durationSec),
        sourceDurationSec: video.durationSec,
      };
    return {
      name: project.images[slot].name,
      timeline: { ...imageTimelineForProject(project, slot), inSec: 0 },
      sourceDurationSec: null,
    };
  };
  const mediaSource = mediaForSlot("source");
  const mediaTarget = mediaForSlot("target");
  const selectedMedia =
    selectedMediaSlot && selectedMediaLayerId === activeLayerId
      ? mediaForSlot(selectedMediaSlot)
      : undefined;
  // Top-most layer first, like the Layers panel and the layer stack HUD.
  const layers = project
    ? [...sortLayers(project.layers)]
        .reverse()
        .filter((layer) => layer.id !== GLOBAL_LAYER_ID)
    : [];
  /** The Global layer: rendered last (base of the stack), not draggable, but its windows and easing show like any other. */
  const baseLayer = project?.layers.find(
    (layer) => layer.id === GLOBAL_LAYER_ID,
  );
  const rowCount = layers.length + (baseLayer ? 1 : 0);
  const selectedLayer = layers.find((layer) => layer.id === activeLayerId);
  const selectedLayerClip =
    project && selectedLayer
      ? layerClipForProject(project, selectedLayer)
      : null;
  const visibleLayerRows = Math.min(
    MAX_VISIBLE_LAYER_ROWS,
    Math.max(1, rowCount),
  );
  // Match the actual 20 px rows + 4 px gaps, the 32 px ruler, its 4 px
  // margin and the 8 px bottom margin. The capped layer scroller includes
  // one final 4 px slot; an uncapped grid has no trailing row gap.
  const bodyHeightPx =
    40 +
    LAYER_ROW_PX * (2 + visibleLayerRows) +
    (rowCount > MAX_VISIBLE_LAYER_ROWS ? 4 : 0);
  // Strip above the transport: 3 px bar (open) or 24 px ruler + 4 px gap.
  const stripPx = timelineOpen ? 3 : 28;
  const dockHeightPx = stripPx + 40 + (timelineOpen ? bodyHeightPx : 0);
  const playheadSec = clamp(tauSec, 0, Math.max(0.001, durationSec));
  /** Block tooltip: the windows in percent when they narrow the transition. */
  const transitionTitle = (name: string, timing: LayerTiming) => {
    const { warpStart, warpEnd, dissolveStart, dissolveEnd } = timing;
    if (
      warpStart <= 0 &&
      warpEnd >= 1 &&
      dissolveStart <= 0 &&
      dissolveEnd >= 1
    ) {
      return name;
    }
    const percent = (value: number) => Math.round(value * 100);
    return t("timeline.transitionWindows", {
      name,
      dissolveStart: percent(dissolveStart),
      dissolveEnd: percent(dissolveEnd),
      warpStart: percent(warpStart),
      warpEnd: percent(warpEnd),
    });
  };

  return (
    <footer
      dir="ltr"
      data-technical-surface="timeline"
      className="flex select-none flex-col overflow-hidden border-t border-border bg-card transition-[height] duration-300 ease-out motion-reduce:transition-none"
      style={{ height: `${dockHeightPx}px` }}
    >
      {/* Playback position, full width, right above the transport: a thin
          progress bar while the dock is open (the full ruler sits below), the
          compact scrubbable ruler once it is collapsed — zen mode included. */}
      {timelineOpen ? (
        <div aria-hidden className="h-[3px] w-full flex-none bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary/40 to-primary"
            style={{ width: pct(playheadSec, durationSec) }}
          />
        </div>
      ) : (
        <div className="flex flex-none px-4 pt-1">
          <PlaybackRuler
            compact
            durationSec={durationSec}
            fps={fps}
            tauSec={tauSec}
            onChange={(sec) => setTimelineTime(sec, durationSec)}
          />
        </div>
      )}
      <div className="flex h-10 flex-none items-center gap-3 px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t("timeline.prevFrame")}
            aria-keyshortcuts={ACTION_ARIA_SHORTCUTS.timelineStepBack}
            title={tooltipWithShortcut(
              t("timeline.prevFrameTitle"),
              `${ACTION_SHORTCUT_LABELS.timelineStepBack} / ${t("timeline.altClick")}`,
            )}
            onClick={(e) => stepTimelineFrame(-1, e.altKey)}
            className={`rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground ${FOCUS_RING}`}
          >
            <StepBack className="size-4" />
          </button>
          <button
            type="button"
            {...assist("timeline.play")}
            aria-label={
              mediaMissing
                ? t("timeline.videoMissing")
                : playing
                  ? t("timeline.pause")
                  : t("timeline.play")
            }
            title={
              mediaMissing
                ? t("timeline.videoMissing")
                : playing
                  ? t("timeline.pause")
                  : t("timeline.play")
            }
            onClick={toggleTimelinePlayback}
            disabled={mediaMissing}
            className={`rounded-md bg-primary/15 p-1.5 text-primary hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
          <button
            type="button"
            aria-label={t("timeline.nextFrame")}
            aria-keyshortcuts={ACTION_ARIA_SHORTCUTS.timelineStepForward}
            title={tooltipWithShortcut(
              t("timeline.nextFrameTitle"),
              `${ACTION_SHORTCUT_LABELS.timelineStepForward} / ${t("timeline.altClick")}`,
            )}
            onClick={(e) => stepTimelineFrame(1, e.altKey)}
            className={`rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground ${FOCUS_RING}`}
          >
            <StepForward className="size-4" />
          </button>
        </div>

        <span
          className="font-mono text-xs text-primary"
          title={t("timeline.tauTitle")}
        >
          τ {formatTimecode(Math.min(tauSec, durationSec), fps)}
        </span>
        <PreviewSyncIndicator />

        {selectedMedia && selectedMediaSlot && (
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <span className="uppercase">
              {selectedMediaSlot === "source" ? "A" : "B"}
            </span>
            <TimecodeInput
              label={t("timeline.start")}
              valueSec={selectedMedia.timeline.startSec}
              maxSec={Math.max(
                0,
                (selectedMedia.sourceDurationSec === null
                  ? PROJECT_LIMITS.timelineDurationSec
                  : durationSec) - selectedMedia.timeline.durationSec,
              )}
              fps={fps}
              onCommit={(startSec) =>
                updateMediaClip(selectedMediaSlot, {
                  ...selectedMedia.timeline,
                  startSec,
                })
              }
            />
            {selectedMedia.sourceDurationSec !== null && (
              <TimecodeInput
                label={t("timeline.in")}
                valueSec={selectedMedia.timeline.inSec}
                maxSec={selectedMedia.sourceDurationSec}
                fps={fps}
                onCommit={(inSec) =>
                  updateMediaClip(selectedMediaSlot, {
                    ...selectedMedia.timeline,
                    inSec,
                  })
                }
              />
            )}
            <TimecodeInput
              label={t("timeline.dur")}
              valueSec={selectedMedia.timeline.durationSec}
              minSec={MIN_VIDEO_CLIP_DURATION_SEC}
              maxSec={
                selectedMedia.sourceDurationSec ??
                PROJECT_LIMITS.timelineDurationSec -
                  selectedMedia.timeline.startSec
              }
              fps={fps}
              onCommit={(durationSec) =>
                updateMediaClip(selectedMediaSlot, {
                  ...selectedMedia.timeline,
                  durationSec,
                })
              }
            />
          </div>
        )}
        {!selectedMedia && selectedLayer && selectedLayerClip && (
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <span className="max-w-28 truncate">
              {layerName(selectedLayer)}
            </span>
            <TimecodeInput
              label={t("timeline.start")}
              valueSec={selectedLayerClip.startSec}
              maxSec={Math.max(0, durationSec - selectedLayerClip.durationSec)}
              fps={fps}
              onCommit={(startSec) =>
                updateClip(selectedLayer.id, {
                  ...selectedLayerClip,
                  startSec,
                })
              }
            />
            <TimecodeInput
              label={t("timeline.dur")}
              valueSec={selectedLayerClip.durationSec}
              minSec={MIN_LAYER_DURATION_SEC}
              maxSec={Math.max(
                MIN_LAYER_DURATION_SEC,
                durationSec - selectedLayerClip.startSec,
              )}
              fps={fps}
              onCommit={(durationSec) =>
                updateClip(selectedLayer.id, {
                  ...selectedLayerClip,
                  durationSec,
                })
              }
            />
          </div>
        )}

        <div className="flex-1" />

        <button
          type="button"
          title={t("shell.panels.timeline")}
          aria-label={t("shell.panels.timeline")}
          aria-expanded={timelineOpen}
          onClick={() => setPanelOpen("timeline", !timelineOpen)}
          className={`rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground ${FOCUS_RING}`}
        >
          {timelineOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </button>
      </div>

      <div inert={!timelineOpen} className="flex-none px-4">
        <div className="mb-1 grid grid-cols-[3.5rem_1fr] gap-x-2 text-[10px] text-muted-foreground">
          <div className="leading-8">{t("timeline.time")}</div>
          <PlaybackRuler
            durationSec={durationSec}
            fps={fps}
            tauSec={tauSec}
            onChange={(sec) => setTimelineTime(sec, durationSec)}
          />
        </div>
        <div
          ref={trackRef}
          {...assist("timeline.tracks")}
          className="mb-2 grid touch-none grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 text-[10px] text-muted-foreground"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="leading-5">A</div>
          <div className="relative rounded bg-muted/60">
            {mediaSource && (
              <TrackBlock
                label={
                  mediaSource.sourceDurationSec === null
                    ? t("timeline.imageClipName", { name: mediaSource.name })
                    : mediaSource.name
                }
                ariaLabel={t("timeline.mediaClip", {
                  slot: "A",
                  name: mediaSource.name,
                })}
                title={
                  mediaSource.sourceDurationSec === null
                    ? t("timeline.imageClipHelp")
                    : mediaSource.name
                }
                onSelect={() => {
                  setSelectedMediaSlot("source");
                  setSelectedMediaLayerId(activeLayerId);
                }}
                startSec={mediaSource.timeline.startSec}
                durationSec={mediaSource.timeline.durationSec}
                totalSec={durationSec}
                className={`${FOCUS_RING} cursor-grab border-image-a/40 bg-image-a/25 text-image-a ${
                  selectedMediaSlot === "source" ? "ring-1 ring-image-a" : ""
                }`}
                onMovePointerDown={(e) =>
                  beginMediaDrag(e, "source", mediaSource, "move")
                }
              >
                <span
                  className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize bg-white/25"
                  onPointerDown={(e) =>
                    beginMediaDrag(e, "source", mediaSource, "start")
                  }
                />
                <span
                  className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize bg-white/25"
                  onPointerDown={(e) =>
                    beginMediaDrag(e, "source", mediaSource, "end")
                  }
                />
              </TrackBlock>
            )}
            <KeyframeMarkers slot="source" totalSec={durationSec} />
            {mediaSource &&
              project &&
              !videoFrameAvailableAt(project, "source", tauSec) && (
                <span className="pointer-events-none absolute right-1 top-1 text-[9px] uppercase text-muted-foreground">
                  {t("timeline.outsideA")}
                </span>
              )}
          </div>
          <div className="leading-5">B</div>
          <div className="relative rounded bg-muted/60">
            {mediaTarget && (
              <TrackBlock
                label={
                  mediaTarget.sourceDurationSec === null
                    ? t("timeline.imageClipName", { name: mediaTarget.name })
                    : mediaTarget.name
                }
                ariaLabel={t("timeline.mediaClip", {
                  slot: "B",
                  name: mediaTarget.name,
                })}
                title={
                  mediaTarget.sourceDurationSec === null
                    ? t("timeline.imageClipHelp")
                    : mediaTarget.name
                }
                onSelect={() => {
                  setSelectedMediaSlot("target");
                  setSelectedMediaLayerId(activeLayerId);
                }}
                startSec={mediaTarget.timeline.startSec}
                durationSec={mediaTarget.timeline.durationSec}
                totalSec={durationSec}
                className={`${FOCUS_RING} cursor-grab border-image-b/40 bg-image-b/25 text-image-b ${
                  selectedMediaSlot === "target" ? "ring-1 ring-image-b" : ""
                }`}
                onMovePointerDown={(e) =>
                  beginMediaDrag(e, "target", mediaTarget, "move")
                }
              >
                <span
                  className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize bg-white/25"
                  onPointerDown={(e) =>
                    beginMediaDrag(e, "target", mediaTarget, "start")
                  }
                />
                <span
                  className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize bg-white/25"
                  onPointerDown={(e) =>
                    beginMediaDrag(e, "target", mediaTarget, "end")
                  }
                />
              </TrackBlock>
            )}
            <KeyframeMarkers slot="target" totalSec={durationSec} />
            {mediaTarget &&
              project &&
              !videoFrameAvailableAt(project, "target", tauSec) && (
                <span className="pointer-events-none absolute right-1 top-1 text-[9px] uppercase text-muted-foreground">
                  {t("timeline.outsideB")}
                </span>
              )}
          </div>
          {rowCount === 0 ? (
            <>
              <div className="leading-5">{t("timeline.layers")}</div>
              <div className="relative rounded bg-muted/60" />
            </>
          ) : (
            <div
              className={`col-span-2 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-1 ${
                rowCount > MAX_VISIBLE_LAYER_ROWS ? "overflow-y-auto pr-1" : ""
              }`}
              style={
                rowCount > MAX_VISIBLE_LAYER_ROWS
                  ? { maxHeight: `${MAX_VISIBLE_LAYER_ROWS * LAYER_ROW_PX}px` }
                  : undefined
              }
            >
              {layers.map((layer, index) => {
                const clip = project
                  ? layerClipForProject(project, layer)
                  : layer.clip;
                // Keyed on stack position (bottom = 0) so colors stay stable.
                const color = layerTrackColor(layers.length - 1 - index);
                if (!clip) return null;
                return (
                  <Fragment key={layer.id}>
                    <button
                      type="button"
                      className={`min-w-0 rounded-sm text-left leading-5 hover:text-foreground ${FOCUS_RING}`}
                      title={layerName(layer)}
                      onClick={() => {
                        setSelectedMediaSlot(null);
                        setActiveLayer(layer.id);
                      }}
                    >
                      <span className="block truncate">{layerName(layer)}</span>
                    </button>
                    <div className="relative rounded bg-muted/60">
                      <TrackBlock
                        label={layerName(layer)}
                        startSec={clip.startSec}
                        durationSec={clip.durationSec}
                        totalSec={durationSec}
                        timing={layer.timing}
                        title={transitionTitle(layerName(layer), layer.timing)}
                        className="cursor-grab"
                        style={{
                          backgroundColor: color.background,
                          borderColor: color.border,
                          color: color.text,
                        }}
                        onMovePointerDown={(e) =>
                          beginLayerDrag(e, layer, "move")
                        }
                      >
                        <span
                          className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize bg-white/20"
                          onPointerDown={(e) =>
                            beginLayerDrag(e, layer, "start")
                          }
                        />
                        <span
                          className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize bg-white/20"
                          onPointerDown={(e) => beginLayerDrag(e, layer, "end")}
                        />
                      </TrackBlock>
                    </div>
                  </Fragment>
                );
              })}
              {baseLayer && project && (
                <Fragment key={baseLayer.id}>
                  <button
                    type="button"
                    className={`min-w-0 rounded-sm text-left leading-5 hover:text-foreground ${FOCUS_RING}`}
                    title={layerName(baseLayer)}
                    onClick={() => {
                      setSelectedMediaSlot(null);
                      setActiveLayer(baseLayer.id);
                    }}
                  >
                    <span className="block truncate">
                      {layerName(baseLayer)}
                    </span>
                  </button>
                  <div className="relative rounded bg-muted/60">
                    <TrackBlock
                      label={layerName(baseLayer)}
                      startSec={
                        layerClipForProject(project, baseLayer).startSec
                      }
                      durationSec={
                        layerClipForProject(project, baseLayer).durationSec
                      }
                      totalSec={durationSec}
                      timing={baseLayer.timing}
                      title={transitionTitle(
                        layerName(baseLayer),
                        baseLayer.timing,
                      )}
                      className="cursor-default border-border bg-muted/40 text-muted-foreground"
                    />
                  </div>
                </Fragment>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
