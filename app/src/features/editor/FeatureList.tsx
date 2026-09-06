import {
  Circle,
  Eye,
  EyeOff,
  Lasso,
  Lock,
  LockOpen,
  Minus,
  Spline,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { featuresForLayer, type FeaturePair } from "@/morph/model";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { commitFeatureChange } from "./featureCommit";
import { featureName } from "./featureName";

const KIND_ICON: Record<FeaturePair["kind"], LucideIcon> = {
  point: Circle,
  segment: Minus,
  polyline: Spline,
  region: Lasso,
};

export function FeatureList() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const selection = useEditorStore((s) => s.selection);
  const selectFeature = useEditorStore((s) => s.selectFeature);
  const activeLayer = project?.layers.find(
    (layer) => layer.id === activeLayerId,
  );
  const features =
    project && activeLayer ? featuresForLayer(project, activeLayer) : [];

  if (features.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("features.empty")}</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {features.map((f, i) => {
        const Icon = KIND_ICON[f.kind];
        const selected = selection.includes(f.id);
        return (
          <li
            key={f.id}
            className={cn(
              "group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm",
              selected
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <button
              type="button"
              onClick={(e) =>
                selectFeature(f.id, e.shiftKey ? "toggle" : "replace")
              }
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-start",
                FOCUS_RING,
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className={cn("truncate", !f.enabled && "opacity-50")}>
                {featureName(f, i)}
              </span>
            </button>
            <button
              type="button"
              title={f.enabled ? t("features.hide") : t("features.show")}
              aria-label={
                f.enabled
                  ? t("features.hideFeature")
                  : t("features.showFeature")
              }
              onClick={() => commitFeatureChange(f.id, { enabled: !f.enabled })}
              className={cn(
                "shrink-0 rounded-sm opacity-60 hover:opacity-100",
                FOCUS_RING,
              )}
            >
              {f.enabled ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              title={f.locked ? t("features.unlock") : t("features.lock")}
              aria-label={
                f.locked
                  ? t("features.unlockFeature")
                  : t("features.lockFeature")
              }
              onClick={() => commitFeatureChange(f.id, { locked: !f.locked })}
              className={cn(
                "shrink-0 rounded-sm opacity-60 hover:opacity-100",
                FOCUS_RING,
              )}
            >
              {f.locked ? (
                <Lock className="size-3.5" />
              ) : (
                <LockOpen className="size-3.5" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
