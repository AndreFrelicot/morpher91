import {
  Layers,
  SlidersHorizontal,
  Square,
  SquareDashedMousePointer,
  X,
} from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { ViewportOverlayToggles } from "./ViewportOverlayControls";
import type { LayerDebugMode, OverlayLayerScope } from "@/morph/layers/debug";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { LayerStackHud } from "./LayerStackHud";

const MODES = [
  {
    id: "composite",
    labelKey: "layerDebug.final",
    titleKey: "layerDebug.finalTitle",
  },
  {
    id: "layer-result",
    labelKey: "layerDebug.layer",
    titleKey: "layerDebug.layerTitle",
  },
  {
    id: "layer-mask",
    labelKey: "layerDebug.mask",
    titleKey: "layerDebug.maskTitle",
  },
  {
    id: "contribution",
    labelKey: "layerDebug.contrib",
    titleKey: "layerDebug.contribTitle",
  },
] as const satisfies readonly {
  id: LayerDebugMode;
  labelKey: string;
  titleKey: string;
}[];

const SCOPES = [
  {
    id: "selected",
    labelKey: "layerDebug.selected",
    titleKey: "layerDebug.selectedTitle",
  },
  { id: "all", labelKey: "layerDebug.all", titleKey: "layerDebug.allTitle" },
] as const satisfies readonly {
  id: OverlayLayerScope;
  labelKey: string;
  titleKey: string;
}[];

function LayerDebugActions() {
  const { t } = useTranslation();
  const mode = useEditorStore((s) => s.layerDebugMode);
  const setMode = useEditorStore((s) => s.setLayerDebugMode);
  const scope = useEditorStore((s) => s.overlayLayerScope);
  const setScope = useEditorStore((s) => s.setOverlayLayerScope);
  const showStack = useEditorStore((s) => s.showLayerStack);
  const setShowStack = useEditorStore((s) => s.setShowLayerStack);

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex max-w-full flex-wrap rounded border border-border/70 bg-background/40 p-0.5">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            title={t(item.titleKey)}
            aria-label={t(item.titleKey)}
            aria-pressed={mode === item.id}
            onClick={() => setMode(item.id)}
            className={cn(
              "rounded px-2 py-0.5 text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              mode === item.id && "bg-accent text-accent-foreground",
            )}
          >
            {item.id === "layer-mask" ? (
              <span className="inline-flex items-center gap-1">
                <Square className="size-3" />
                {t(item.labelKey)}
              </span>
            ) : item.id === "contribution" ? (
              <span className="inline-flex items-center gap-1">
                <SquareDashedMousePointer className="size-3" />
                {t(item.labelKey)}
              </span>
            ) : (
              t(item.labelKey)
            )}
          </button>
        ))}
      </div>
      <div className="flex max-w-full flex-wrap rounded border border-border/70 bg-background/40 p-0.5">
        {SCOPES.map((item) => (
          <button
            key={item.id}
            type="button"
            title={t(item.titleKey)}
            aria-label={t(item.titleKey)}
            aria-pressed={scope === item.id}
            onClick={() => setScope(item.id)}
            className={cn(
              "rounded px-2 py-0.5 text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              scope === item.id && "bg-accent text-accent-foreground",
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
      <button
        type="button"
        title={t("layerDebug.layerStack")}
        aria-label={t("layerDebug.layerStack")}
        aria-pressed={showStack}
        onClick={() => setShowStack(!showStack)}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          showStack && "bg-accent text-accent-foreground",
        )}
      >
        <Layers className="size-3.5" />
      </button>
      <ViewportOverlayToggles
        slot="preview"
        className="border-s border-border/70 ps-1"
      />
    </div>
  );
}

/** Use the preview pane's width, not the window's: Triple can be very narrow. */
export function LayerDebugControls() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    // CSS hides the trigger when the pane grows; dismiss its portalled menu too.
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width === 0) setOpen(false);
    });
    observer.observe(triggerRef.current);
    return () => observer.disconnect();
  }, [open]);
  return (
    <>
      <div className="pointer-events-auto absolute left-2 top-12 z-20 hidden max-w-[calc(100%-1rem)] rounded-md border border-border bg-background/80 p-1 text-[11px] shadow-sm backdrop-blur @min-[16rem]/morph-view:block">
        <LayerDebugActions />
      </div>
      <div className="pointer-events-auto absolute left-2 top-12 z-20 @min-[16rem]/morph-view:hidden">
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              title={t("layerDebug.controls")}
              aria-label={t("layerDebug.controls")}
              className="flex size-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              aria-label={t("layerDebug.controls")}
              side="bottom"
              align="start"
              sideOffset={8}
              collisionPadding={12}
              className={cn(
                dialogStyles.surface,
                "z-50 max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-4",
              )}
              onKeyDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className={dialogStyles.title}>
                  {t("layerDebug.controls")}
                </h2>
                <Popover.Close
                  aria-label={t("mobile.close")}
                  className={dialogStyles.close}
                >
                  <X className="size-4" />
                </Popover.Close>
              </div>
              <LayerDebugActions />
              <LayerStackHud inline />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </>
  );
}
