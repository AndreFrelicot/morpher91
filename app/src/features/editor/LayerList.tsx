import { layerName } from "@/features/editor/layerName";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import {
  canAddUserLayer,
  createLayer,
  featuresForLayer,
  GLOBAL_LAYER_ID,
  layerContribution,
  sortLayers,
  type LayerContributionStatus,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";

const STATUS_CLASS: Record<LayerContributionStatus, string> = {
  base: "border-border/70 text-muted-foreground",
  disabled: "border-border/50 text-muted-foreground",
  hidden: "border-border/50 text-muted-foreground",
  "outside-clip": "border-border/60 text-muted-foreground",
  "no-contribution": "border-border/70 text-muted-foreground",
  masked: "border-primary/40 text-primary",
  "full-frame": "border-amber-400/40 text-amber-200",
};

export function LayerList() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const addLayer = useProjectStore((s) => s.addLayer);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  // Frame-quantized: contribution badges only change at frame granularity.
  const tauSec = useFrameTauSec();

  if (!project) {
    return (
      <p className="text-xs text-muted-foreground">{t("layers.importFirst")}</p>
    );
  }

  const layers = sortLayers(project.layers);
  const visibleLayers = [...layers].reverse();

  const add = () => {
    const nextIndex = Math.max(...layers.map((layer) => layer.zIndex), 0) + 1;
    const layer = createLayer(
      t("layers.defaultName", { index: layers.length }),
      nextIndex,
    );
    addLayer(layer);
    setActiveLayer(layer.id);
  };

  const move = (id: string, direction: -1 | 1) => {
    const index = layers.findIndex((layer) => layer.id === id);
    const target = layers[index + direction];
    const current = layers[index];
    if (!current || !target || current.id === GLOBAL_LAYER_ID) return;
    updateLayer(current.id, { zIndex: target.zIndex });
    updateLayer(target.id, { zIndex: current.zIndex });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        {...assist("layers.add")}
        onClick={add}
        disabled={!canAddUserLayer(layers)}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          FOCUS_RING,
        )}
      >
        <Plus className="size-3.5" />
        {t("layers.add")}
      </button>
      <ul className="space-y-1" {...assist("layers.list")}>
        {visibleLayers.map((layer) => {
          const selected = activeLayerId === layer.id;
          const isGlobal = layer.id === GLOBAL_LAYER_ID;
          const ascendingIndex = layers.findIndex((x) => x.id === layer.id);
          const featureCount = featuresForLayer(project, layer).length;
          const contribution = layerContribution(project, layer, tauSec);

          return (
            <li
              key={layer.id}
              className={cn(
                "rounded-md px-1.5 py-1 text-sm",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveLayer(layer.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-sm text-start leading-5",
                    FOCUS_RING,
                  )}
                >
                  {layerName(layer)}
                </button>
                {!isGlobal && (
                  <>
                    <button
                      type="button"
                      title={
                        layer.visible
                          ? t("layers.hideLayer")
                          : t("layers.showLayer")
                      }
                      aria-label={
                        layer.visible
                          ? t("layers.hideLayer")
                          : t("layers.showLayer")
                      }
                      onClick={() =>
                        updateLayer(layer.id, { visible: !layer.visible })
                      }
                      className={cn(
                        "rounded-sm p-0.5 opacity-70 hover:opacity-100",
                        FOCUS_RING,
                      )}
                    >
                      {layer.visible ? (
                        <Eye className="size-3.5" />
                      ) : (
                        <EyeOff className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      title={
                        layer.locked
                          ? t("layers.unlockLayer")
                          : t("layers.lockLayer")
                      }
                      aria-label={
                        layer.locked
                          ? t("layers.unlockLayer")
                          : t("layers.lockLayer")
                      }
                      onClick={() =>
                        updateLayer(layer.id, { locked: !layer.locked })
                      }
                      className={cn(
                        "rounded-sm p-0.5 opacity-70 hover:opacity-100",
                        FOCUS_RING,
                      )}
                    >
                      {layer.locked ? (
                        <Lock className="size-3.5" />
                      ) : (
                        <LockOpen className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      title={t("layers.moveUp")}
                      aria-label={t("layers.moveUp")}
                      disabled={ascendingIndex === layers.length - 1}
                      onClick={() => move(layer.id, 1)}
                      className={cn(
                        "rounded-sm p-0.5 opacity-70 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30",
                        FOCUS_RING,
                      )}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("layers.moveDown")}
                      aria-label={t("layers.moveDown")}
                      disabled={ascendingIndex <= 1}
                      onClick={() => move(layer.id, -1)}
                      className={cn(
                        "rounded-sm p-0.5 opacity-70 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30",
                        FOCUS_RING,
                      )}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => setActiveLayer(layer.id)}
                className="mt-0.5 flex w-full items-center gap-1.5 overflow-hidden text-start text-[10px] leading-none outline-none"
              >
                <span className="whitespace-nowrap opacity-70">
                  {t("layers.featureCount", { count: featureCount })}
                </span>
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-sm border px-1 py-0.5 text-[9px] uppercase leading-none tracking-wide",
                    STATUS_CLASS[contribution.status],
                  )}
                >
                  {t(`layers.status.${contribution.status}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
