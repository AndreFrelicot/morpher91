import { layerName } from "@/features/editor/layerName";
import { useNumberFormatter } from "@/i18n/formatters";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  effectiveLayerAlgorithm,
  layerContribution,
  sortLayers,
  type LayerContributionStatus,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";

const STATUS_CLASS: Record<LayerContributionStatus, string> = {
  base: "border-border text-muted-foreground",
  disabled: "border-border/60 text-muted-foreground/70",
  hidden: "border-border/60 text-muted-foreground/70",
  "outside-clip": "border-border/60 text-muted-foreground/70",
  "no-contribution": "border-border text-muted-foreground",
  masked: "border-primary/45 text-primary",
  "full-frame": "border-amber-400/50 text-amber-700 dark:text-amber-200",
};

const PLANE_CLASS: Record<LayerContributionStatus, string> = {
  base: "bg-muted-foreground/25",
  disabled: "bg-muted-foreground/10",
  hidden: "bg-muted-foreground/10",
  "outside-clip": "bg-muted-foreground/10",
  "no-contribution": "bg-transparent",
  masked: "bg-primary/60",
  "full-frame": "bg-amber-300/60",
};

export function LayerStackHud({ inline = false }: { inline?: boolean }) {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const project = useProjectStore((s) => s.project);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const show = useEditorStore((s) => s.showLayerStack);
  const setShow = useEditorStore((s) => s.setShowLayerStack);
  const setHoveredLayer = useEditorStore((s) => s.setHoveredLayer);
  // Frame-quantized: contribution planes only change at frame granularity.
  const tauSec = useFrameTauSec();

  if (!project || !show) return null;

  const layers = [...sortLayers(project.layers)].reverse();

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-md border border-border bg-background/90 p-2 text-xs",
        inline
          ? "mt-3 w-full"
          : "absolute bottom-3 right-2 z-20 hidden max-h-[calc(100%-7rem)] w-72 max-w-[calc(100%-1rem)] overflow-y-auto shadow-lg backdrop-blur @min-[16rem]/morph-view:block",
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {t("layerDebug.layerStack")}
        </span>
        <button
          type="button"
          title={t("layerDebug.closeStack")}
          aria-label={t("layerDebug.closeStack")}
          onClick={() => setShow(false)}
          className="rounded p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="space-y-1">
        {layers.map((layer, index) => {
          const contribution = layerContribution(project, layer, tauSec);
          const selected = activeLayerId === layer.id;
          const algorithm = effectiveLayerAlgorithm(project, layer);
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => setActiveLayer(layer.id)}
              onPointerEnter={() => setHoveredLayer(layer.id)}
              onPointerLeave={() => setHoveredLayer(null)}
              className={cn(
                "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-1.5 py-1 text-start outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-accent text-accent-foreground",
              )}
            >
              <span className="relative h-6">
                <span
                  className={cn(
                    "absolute left-1 right-1 h-3 rounded-sm border border-border/70",
                    PLANE_CLASS[contribution.status],
                  )}
                  style={{
                    top: `${Math.min(index, 4) * 3}px`,
                    transform: "skewX(-18deg)",
                  }}
                />
              </span>
              <span className="min-w-0">
                <span
                  className="block truncate font-medium"
                  title={layerName(layer)}
                >
                  {layerName(layer)}
                </span>
                <span
                  className={cn(
                    "block text-[10px] text-muted-foreground",
                    inline ? "break-words" : "truncate",
                  )}
                >
                  {t(`algorithmShortNames.${algorithm}`)} ·{" "}
                  {t("layerDebug.opacity")} {formatNumber(layer.opacity, 2)} ·{" "}
                  {t(`layerInspector.blendModes.${layer.compositeMode}`)}
                </span>
              </span>
              <span
                className={cn(
                  "rounded-sm border px-1 py-0.5 text-[9px] uppercase leading-none tracking-wide",
                  STATUS_CLASS[contribution.status],
                )}
              >
                {t(`layers.status.${contribution.status}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
