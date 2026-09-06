import {
  Grid2X2,
  Network,
  Spline,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  effectiveLayerAlgorithm,
  layerContributesToRender,
  type MorphAlgorithmId,
} from "@/morph/model";
import {
  useEditorStore,
  type PreviewOverlays,
  type ViewportOverlaySlot,
} from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";

type OverlayKey = keyof PreviewOverlays;

const OVERLAY_META: Record<
  OverlayKey,
  { Icon: LucideIcon; algorithms?: MorphAlgorithmId[] }
> = {
  features: { Icon: Waypoints },
  mesh: { Icon: Network, algorithms: ["mesh"] },
  tpsGrid: { Icon: Grid2X2, algorithms: ["thin-plate-spline"] },
  beierField: { Icon: Spline, algorithms: ["beier-neely"] },
};

function visibleOverlayKeys(
  activeAlgorithms: MorphAlgorithmId[],
): OverlayKey[] {
  const active = new Set(activeAlgorithms);
  return (Object.keys(OVERLAY_META) as OverlayKey[]).filter((key) => {
    const algorithms = OVERLAY_META[key].algorithms;
    return !algorithms || algorithms.some((algorithm) => active.has(algorithm));
  });
}

function labelFor(slot: ViewportOverlaySlot, key: OverlayKey): string {
  const label = i18next.t(`overlays.${key}`);
  if (key === "features" || slot === "preview") return label;
  const slotLabel = i18next.t(`overlays.slots.${slot}`);
  if (key === "mesh")
    return i18next.t("overlays.slotMesh", { slot: slotLabel });
  return i18next.t("overlays.slotLabel", { slot: slotLabel, label });
}

/** Bare overlay toggle buttons, to embed inside another toolbar. */
export function ViewportOverlayToggles({
  slot,
  className,
}: {
  slot: ViewportOverlaySlot;
  className?: string;
}) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const scope = useEditorStore((s) => s.overlayLayerScope);
  const overlays = useEditorStore((s) => s.viewportOverlays[slot]);
  const setViewportOverlays = useEditorStore((s) => s.setViewportOverlays);
  // Frame-quantized: layer contribution only changes at frame granularity.
  const tauSec = useFrameTauSec();
  const activeLayer = project?.layers.find(
    (layer) => layer.id === activeLayerId,
  );
  const algorithms =
    project && scope === "all"
      ? project.layers
          .filter((layer) => layerContributesToRender(project, layer, tauSec))
          .map((layer) => effectiveLayerAlgorithm(project, layer))
      : project &&
          activeLayer &&
          layerContributesToRender(project, activeLayer, tauSec)
        ? [effectiveLayerAlgorithm(project, activeLayer)]
        : project
          ? [project.activeAlgorithm]
          : [];
  if (algorithms.length === 0) return null;
  const keys = visibleOverlayKeys(algorithms);

  return (
    <div
      className={cn("flex flex-wrap gap-1", className)}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {keys.map((key) => {
        const { Icon } = OVERLAY_META[key];
        const label = labelFor(slot, key);
        const active = overlays[key];
        return (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={t("overlays.overlayAria", { label })}
            aria-pressed={active}
            onClick={() =>
              setViewportOverlays(slot, {
                [key]: !active,
              } as Partial<PreviewOverlays>)
            }
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors outline-none hover:bg-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/** Floating overlay toggles pinned to the top-right of a viewport. */
export function ViewportOverlayControls({
  slot,
  className,
}: {
  slot: ViewportOverlaySlot;
  className?: string;
}) {
  return (
    <ViewportOverlayToggles
      slot={slot}
      className={cn(
        "pointer-events-auto absolute right-2 top-12 z-20 max-w-[calc(100%-1rem)] rounded-md border border-border bg-background/80 p-1 shadow-sm backdrop-blur",
        className,
      )}
    />
  );
}
