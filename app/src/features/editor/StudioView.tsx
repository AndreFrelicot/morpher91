import { EyeOff, Link2, Link2Off, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import {
  useEditorStore,
  type StudioView as StudioViewMode,
  type ViewportSlot,
} from "@/store/editorStore";
import { MAX_ZOOM, MIN_ZOOM } from "./gesture/pinch";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { shouldWarnFeatureCount } from "@/lib/messages";
import { TooManyFeaturesNotice } from "@/ui/components/TooManyFeaturesNotice";
import { FOCUS_RING } from "@/ui/focusRing";
import { MorphCanvas } from "./MorphCanvas";
import { SplitEditor } from "./SplitEditor";
import { TripleView } from "./TripleView";
import {
  ACTION_SHORTCUT_LABELS,
  tooltipWithShortcut,
  useKeyboardShortcuts,
} from "./useKeyboardShortcuts";

const VIEWS: StudioViewMode[] = ["edit", "preview", "triple"];

function ViewToggle() {
  const { t } = useTranslation();
  const studioView = useEditorStore((s) => s.studioView);
  const setStudioView = useEditorStore((s) => s.setStudioView);
  const viewportsLinked = useEditorStore((s) => s.viewportsLinked);
  const setViewportsLinked = useEditorStore((s) => s.setViewportsLinked);
  const linkLabel = t(
    viewportsLinked ? "studio.viewportsLinked" : "studio.viewportsUnlinked",
  );

  return (
    <div
      className="absolute left-1/2 top-2 z-30 flex max-w-[calc(100%-0.5rem)] -translate-x-1/2 gap-0.5 rounded-md border border-border bg-background/80 p-0.5 backdrop-blur"
      {...assist("view.toggle")}
    >
      <select
        aria-label={t("mobile.views")}
        value={studioView}
        onChange={(event) =>
          setStudioView(event.target.value as StudioViewMode)
        }
        className="min-w-0 rounded border border-border bg-background px-1 py-1 text-xs text-foreground @min-[20rem]/studio:hidden"
      >
        {VIEWS.map((id) => (
          <option key={id} value={id}>
            {t(`studio.${id}`)}
          </option>
        ))}
      </select>
      {VIEWS.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={studioView === id}
          onClick={() => setStudioView(id)}
          className={cn(
            "hidden shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors @min-[20rem]/studio:block",
            FOCUS_RING,
            studioView === id
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`studio.${id}`)}
        </button>
      ))}
      {studioView !== "preview" && (
        <>
          <span className="my-1 w-px self-stretch bg-border" />
          <button
            type="button"
            title={linkLabel}
            aria-label={linkLabel}
            aria-pressed={viewportsLinked}
            onClick={() => setViewportsLinked(!viewportsLinked)}
            className={cn(
              "flex shrink-0 items-center rounded px-2 py-1 transition-colors",
              FOCUS_RING,
              viewportsLinked
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {viewportsLinked ? (
              <Link2 className="size-3.5" />
            ) : (
              <Link2Off className="size-3.5" />
            )}
          </button>
        </>
      )}
    </div>
  );
}

const ZOOM_STEP = 1.25;

/** Zoom controls pill: −/+ steps and a %-readout that resets to 100%/fit. */
function ZoomPill() {
  const { t } = useTranslation();
  const studioView = useEditorStore((s) => s.studioView);
  // Representative pane: the split editor has no preview pane, use source.
  const slot: ViewportSlot = studioView === "edit" ? "source" : "preview";
  const zoom = useEditorStore((s) => s.viewports[slot].zoom);

  // When viewports are linked, one setViewport syncs every pane; when they
  // are not, the pill still drives all panes to the same explicit value.
  const eachSlot = (apply: (slot: ViewportSlot) => void) => {
    const state = useEditorStore.getState();
    (state.viewportsLinked
      ? [slot]
      : (["source", "preview", "target"] as const)
    ).forEach(apply);
  };
  const applyZoom = (next: number) => {
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    eachSlot((s) => useEditorStore.getState().setViewport(s, { zoom: value }));
  };
  const reset = () =>
    eachSlot((s) =>
      useEditorStore
        .getState()
        .setViewport(s, { zoom: 1, pan: { x: 0, y: 0 } }),
    );

  return (
    <div className="absolute bottom-2 left-2 z-30 flex items-center gap-0.5 rounded-md border border-border bg-background/80 p-0.5 backdrop-blur">
      <button
        type="button"
        title={t("studio.zoomOut")}
        aria-label={t("studio.zoomOut")}
        disabled={zoom <= MIN_ZOOM}
        onClick={() => applyZoom(zoom / ZOOM_STEP)}
        className={cn(
          "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
          FOCUS_RING,
        )}
      >
        <Minus className="size-3.5" />
      </button>
      <button
        type="button"
        title={t("studio.zoomReset")}
        aria-label={t("studio.zoomReset")}
        onClick={reset}
        className={cn(
          "min-w-11 rounded px-1 py-0.5 text-center font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground",
          FOCUS_RING,
        )}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        title={t("studio.zoomIn")}
        aria-label={t("studio.zoomIn")}
        disabled={zoom >= MAX_ZOOM}
        onClick={() => applyZoom(zoom * ZOOM_STEP)}
        className={cn(
          "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
          FOCUS_RING,
        )}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/** Ghost button shown while the overlay chrome is hidden: the way back for mouse users. */
function ShowChromeButton() {
  const { t } = useTranslation();
  const setHidden = useEditorStore((s) => s.setOverlayChromeHidden);
  const label = tooltipWithShortcut(
    t("shell.showChrome"),
    ACTION_SHORTCUT_LABELS.overlayChrome,
  );
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-keyshortcuts={ACTION_SHORTCUT_LABELS.overlayChrome}
      onClick={() => setHidden(false)}
      className={cn(
        "absolute left-1/2 top-2 z-30 flex size-7 -translate-x-1/2 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground opacity-40 backdrop-blur transition-opacity hover:opacity-100 focus-visible:opacity-100",
        FOCUS_RING,
      )}
    >
      <EyeOff className="size-3.5" />
    </button>
  );
}

export function StudioView() {
  const studioView = useEditorStore((s) => s.studioView);
  const chromeHidden = useEditorStore((s) => s.overlayChromeHidden);
  const featureCount = useProjectStore((s) => s.project?.features.length ?? 0);
  useKeyboardShortcuts();

  return (
    <div
      dir="ltr"
      data-technical-surface="studio"
      className="@container/studio relative h-full w-full"
    >
      {chromeHidden ? (
        <ShowChromeButton />
      ) : (
        <>
          <ViewToggle />
          <ZoomPill />
          {shouldWarnFeatureCount(featureCount) && (
            <TooManyFeaturesNotice className="pointer-events-none absolute right-2 top-14 z-10 max-w-xs" />
          )}
        </>
      )}
      {studioView === "edit" ? (
        <SplitEditor />
      ) : studioView === "triple" ? (
        <TripleView />
      ) : (
        <MorphCanvas />
      )}
    </div>
  );
}
