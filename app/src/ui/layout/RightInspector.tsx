import { useNumberFormatter } from "@/i18n/formatters";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { FeatureInspector } from "@/features/editor/FeatureInspector";
import { LayerInspector } from "@/features/editor/LayerInspector";
import { LayerList } from "@/features/editor/LayerList";
import { LayerTransitionControls } from "@/features/editor/LayerTransitionControls";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { assist } from "@/assist/anchors";
import { AlgorithmIcon } from "@/ui/components/AlgorithmIcon";
import {
  InspectorSection,
  InspectorSections,
} from "@/ui/components/InspectorSection";
import { GLOBAL_LAYER_ID } from "@/morph/model";
import type {
  BeierNeelySettings,
  MorphAlgorithmId,
  TpsSettings,
} from "@/morph/model";

const ALGORITHMS: { id: MorphAlgorithmId; enabled: boolean }[] = [
  { id: "crossfade", enabled: true },
  { id: "mesh", enabled: true },
  { id: "thin-plate-spline", enabled: true },
  { id: "beier-neely", enabled: true },
];

function AlgorithmList() {
  const { t } = useTranslation();
  const active = useProjectStore((s) => s.activeAlgorithm);
  const setAlgorithm = useProjectStore((s) => s.setAlgorithm);

  return (
    <ul className="space-y-1" {...assist("algorithm.list")}>
      {ALGORITHMS.map(({ id, enabled }) => (
        <li key={id}>
          <button
            type="button"
            disabled={!enabled}
            aria-pressed={active === id}
            onClick={() => setAlgorithm(id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border px-2 py-1.5 text-start transition-colors",
              FOCUS_RING,
              active === id
                ? "border-ring/50 bg-accent text-accent-foreground"
                : enabled
                  ? "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  : "cursor-not-allowed border-transparent text-muted-foreground/40",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md border",
                active === id
                  ? "border-ring/40 bg-background/40"
                  : "border-border bg-card/60",
              )}
            >
              <AlgorithmIcon id={id} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm leading-4">
                {t(`algorithmNames.${id}`)}
                {!enabled && (
                  <span className="ml-1 text-[10px] uppercase tracking-wider">
                    {t("inspector.soon")}
                  </span>
                )}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {t(`algorithms.${id}`)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** TPS-specific settings (PRD §10.4), shown only when TPS is the active algorithm. */
function TpsControls() {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const tps = useProjectStore(
    (s) => s.project?.algorithmSettings.thinPlateSpline,
  );
  const setTpsSettings = useProjectStore((s) => s.setTpsSettings);
  if (!tps) return null;

  const patch = (p: Partial<TpsSettings>) => setTpsSettings(p);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Thin-Plate Spline
      </h3>
      <div className="space-y-3">
        <label className="block text-xs">
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("tps.smoothing")}</span>
            <span className="tabular-nums">{formatNumber(tps.lambda, 4)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={0.05}
            step={0.0005}
            value={tps.lambda}
            onChange={(e) => patch({ lambda: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("tps.borderAnchors")}
          </span>
          <input
            type="checkbox"
            checked={tps.borderAnchors}
            onChange={() => patch({ borderAnchors: !tps.borderAnchors })}
          />
        </label>

        <label
          className={cn("block text-xs", !tps.borderAnchors && "opacity-50")}
        >
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("tps.anchorsPerSide")}</span>
            <span className="tabular-nums">{tps.borderAnchorCount}</span>
          </div>
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={tps.borderAnchorCount}
            disabled={!tps.borderAnchors}
            onChange={(e) =>
              patch({ borderAnchorCount: Number(e.target.value) })
            }
            className="w-full"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("tps.samplePolylines")}
          </span>
          <input
            type="checkbox"
            checked={tps.samplePolylines}
            onChange={() => patch({ samplePolylines: !tps.samplePolylines })}
          />
        </label>

        <label
          className={cn("block text-xs", !tps.samplePolylines && "opacity-50")}
        >
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("tps.sampleSpacing")}</span>
            <span className="tabular-nums">
              {formatNumber(tps.polylineSampleSpacing, 3)}
            </span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.1}
            step={0.005}
            value={tps.polylineSampleSpacing}
            disabled={!tps.samplePolylines}
            onChange={(e) =>
              patch({ polylineSampleSpacing: Number(e.target.value) })
            }
            className="w-full"
          />
        </label>
      </div>
    </div>
  );
}

/** Beier–Neely settings (PRD §10.5), shown only when it is the active algorithm. */
function BeierControls() {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const beier = useProjectStore((s) => s.project?.algorithmSettings.beierNeely);
  const setBeierSettings = useProjectStore((s) => s.setBeierSettings);
  if (!beier) return null;

  const patch = (p: Partial<BeierNeelySettings>) => setBeierSettings(p);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Beier–Neely
      </h3>
      <div className="space-y-3">
        <label className="block text-xs">
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("beier.distanceSoftness")}</span>
            <span className="tabular-nums">{formatNumber(beier.a, 4)}</span>
          </div>
          <input
            type="range"
            min={0.0005}
            max={0.05}
            step={0.0005}
            value={beier.a}
            onChange={(e) => patch({ a: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="block text-xs">
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("beier.falloffExponent")}</span>
            <span className="tabular-nums">{formatNumber(beier.b, 1)}</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={beier.b}
            onChange={(e) => patch({ b: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="block text-xs">
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("beier.lineLengthInfluence")}</span>
            <span className="tabular-nums">{formatNumber(beier.p, 2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={beier.p}
            onChange={(e) => patch({ p: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="block text-xs">
          <div className="mb-1 flex items-center justify-between text-muted-foreground">
            <span>{t("beier.maxLines")}</span>
            <span className="tabular-nums">{beier.maxLines}</span>
          </div>
          <input
            type="range"
            min={1}
            max={256}
            step={1}
            value={beier.maxLines}
            onChange={(e) => patch({ maxLines: Number(e.target.value) })}
            className="w-full"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("beier.samplePolylines")}
          </span>
          <input
            type="checkbox"
            checked={beier.samplePolylines}
            onChange={() => patch({ samplePolylines: !beier.samplePolylines })}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Right inspector (M14): Algorithm, Layers and Selection are stacked,
 * always-present collapsible sections — no control ever disappears because of
 * an unrelated selection. Selecting a feature opens and briefly highlights the
 * Selection section instead of replacing the panel.
 *
 * `embedded` (mobile sheet) renders the sections without the desktop chrome:
 * no collapse header, no animated width, parent controls the box.
 */
export function RightInspector({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const active = useProjectStore((s) => s.activeAlgorithm);
  const project = useProjectStore((s) => s.project);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const hasSelection = useEditorStore((s) => s.selection.length > 0);
  const setSectionOpen = useEditorStore((s) => s.setInspectorSectionOpen);
  const open = useEditorStore((s) => s.panelsOpen.right);
  const setPanelOpen = useEditorStore((s) => s.setPanelOpen);

  const activeLayer = project?.layers.find((l) => l.id === activeLayerId);
  const layerOverride = activeLayer?.algorithmOverride;

  // Selection rising edge: open + flash + scroll the Selection section.
  const selectionRef = useRef<HTMLDivElement>(null);
  const hadSelection = useRef(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (hasSelection && !hadSelection.current) {
      setSectionOpen("selection", true);
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 900);
      selectionRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      hadSelection.current = true;
      return () => clearTimeout(timer);
    }
    hadSelection.current = hasSelection;
  }, [hasSelection, setSectionOpen]);

  const sections = (
    <InspectorSections>
      <InspectorSection
        id="algorithm"
        title={t("inspector.algorithm")}
        badge={
          layerOverride ? (
            <span className="rounded-sm border border-primary/40 px-1 py-0.5 text-[9px] uppercase leading-none tracking-wide text-primary">
              {t("inspector.overrideBadge", {
                name: t(`algorithmNames.${layerOverride}`),
              })}
            </span>
          ) : undefined
        }
      >
        <AlgorithmList />
        {(active === "thin-plate-spline" || active === "beier-neely") && (
          <div {...assist("algorithm.settings")}>
            {active === "thin-plate-spline" ? (
              <TpsControls />
            ) : (
              <BeierControls />
            )}
          </div>
        )}
      </InspectorSection>

      <InspectorSection id="layers" title={t("sidebar.layers")}>
        <LayerList />
        {activeLayerId === GLOBAL_LAYER_ID ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {t("layers.globalHint")}
            </p>
            {activeLayer && <LayerTransitionControls layer={activeLayer} />}
          </div>
        ) : (
          <div
            className="mt-3 border-t border-border pt-3"
            {...assist("layers.inspector")}
          >
            <LayerInspector />
          </div>
        )}
      </InspectorSection>

      <InspectorSection
        id="selection"
        title={t("inspector.selection")}
        flash={flash}
        ref={selectionRef}
      >
        <div {...assist("selection.inspector")}>
          {hasSelection ? (
            <FeatureInspector />
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("inspector.selectionHint")}
            </p>
          )}
        </div>
      </InspectorSection>
    </InspectorSections>
  );

  if (embedded) {
    return <aside className="flex flex-col">{sections}</aside>;
  }

  return (
    <aside
      inert={!open}
      className={cn(
        "overflow-hidden bg-card transition-[width,border-color] duration-300 ease-out motion-reduce:transition-none",
        open ? "w-80 border-s border-border" : "w-0 border-s-0",
      )}
    >
      <div className="flex h-full w-80 flex-col">
        <div className="flex items-center justify-between border-b border-border py-1 pl-3 pr-1.5">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("inspector.panel")}
          </h2>
          <button
            type="button"
            title={t("shell.collapse")}
            aria-label={t("shell.collapse")}
            onClick={() => setPanelOpen("right", false)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{sections}</div>
      </div>
    </aside>
  );
}
