import { useNumberFormatter } from "@/i18n/formatters";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import type { MorphAlgorithmId, MorphLayer } from "@/morph/model";
import {
  GLOBAL_LAYER_ID,
  layerClipForProject,
  layerContribution,
  sortLayers,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";
import { featureName } from "./featureName";
import { LayerTransitionControls } from "./LayerTransitionControls";

const ALGORITHMS: MorphAlgorithmId[] = [
  "crossfade",
  "mesh",
  "thin-plate-spline",
  "beier-neely",
];

const COMPOSITE_MODES: MorphLayer["compositeMode"][] = [
  "normal",
  "source-over",
  "multiply",
  "screen",
  "lighter",
];

function Row({
  label,
  children,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={disabled ? "opacity-50" : undefined}>{children}</span>
    </label>
  );
}

export function LayerInspector() {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  // Frame-quantized: the contribution readout changes at frame granularity.
  const tauSec = useFrameTauSec();
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const project = useProjectStore((s) => s.project);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const removeLayer = useProjectStore((s) => s.removeLayer);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirmOpen) return;

    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  if (!project || activeLayerId === GLOBAL_LAYER_ID) return null;

  const layer = project.layers.find((item) => item.id === activeLayerId);
  if (!layer) return null;

  const regions = project.features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => feature.kind === "region");

  const patchMask = (patch: Partial<NonNullable<MorphLayer["mask"]>>) => {
    if (!layer.mask) return;
    updateLayer(layer.id, { mask: { ...layer.mask, ...patch } });
  };
  const contribution = layerContribution(project, layer, tauSec);
  const clip = layerClipForProject(project, layer);

  const remove = () => {
    setConfirmOpen(false);
    removeLayer(layer.id);
    clearSelection();
    setActiveLayer(GLOBAL_LAYER_ID);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("layerInspector.title")}
        </p>
        <input
          type="text"
          value={layer.name}
          onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </div>

      <Row label={t("layerInspector.enabled")}>
        <input
          type="checkbox"
          checked={layer.enabled}
          onChange={() => updateLayer(layer.id, { enabled: !layer.enabled })}
        />
      </Row>

      <Row label={t("layerInspector.visible")}>
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={() => updateLayer(layer.id, { visible: !layer.visible })}
        />
      </Row>

      <Row label={t("layerInspector.locked")}>
        <input
          type="checkbox"
          checked={layer.locked}
          onChange={() => updateLayer(layer.id, { locked: !layer.locked })}
        />
      </Row>

      <p
        className={cn(
          "rounded-md border px-2 py-1.5 text-[11px] leading-4",
          contribution.status === "full-frame"
            ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
            : contribution.status === "masked"
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border bg-card/40 text-muted-foreground",
        )}
      >
        {t(`layerInspector.scope.${contribution.status}`)}
      </p>

      <Row label={t("layerInspector.algorithm")}>
        <select
          {...assist("layer.algorithmOverride")}
          value={layer.algorithmOverride ?? ""}
          onChange={(e) =>
            updateLayer(layer.id, {
              algorithmOverride: (e.target.value || undefined) as
                | MorphAlgorithmId
                | undefined,
            })
          }
          className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
        >
          <option value="">{t("layerInspector.projectDefault")}</option>
          {ALGORITHMS.map((algorithm) => (
            <option key={algorithm} value={algorithm}>
              {t(`algorithmNames.${algorithm}`)}
            </option>
          ))}
        </select>
      </Row>

      <label className="block text-xs" {...assist("layer.opacity")}>
        <div className="mb-1 flex items-center justify-between text-muted-foreground">
          <span>{t("layerInspector.opacity")}</span>
          <span className="tabular-nums">{formatNumber(layer.opacity, 2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.opacity}
          onChange={(e) =>
            updateLayer(layer.id, { opacity: Number(e.target.value) })
          }
          className="w-full"
        />
      </label>

      <Row label={t("layerInspector.blend")}>
        <select
          value={layer.compositeMode}
          onChange={(e) =>
            updateLayer(layer.id, {
              compositeMode: e.target.value as MorphLayer["compositeMode"],
            })
          }
          className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
        >
          {COMPOSITE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`layerInspector.blendModes.${mode}`)}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t("layerInspector.mask")}>
        <select
          {...assist("layer.maskSelect")}
          value={layer.mask?.featureId ?? ""}
          onChange={(e) => {
            const featureId = e.target.value;
            updateLayer(layer.id, {
              mask: featureId
                ? {
                    featureId,
                    mode: layer.mask?.mode ?? "feathered",
                    feather: layer.mask?.feather ?? 0.04,
                    invert: layer.mask?.invert,
                  }
                : undefined,
            });
          }}
          className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
        >
          <option value="">{t("layerInspector.none")}</option>
          {regions.map(({ feature, index }) => (
            <option key={feature.id} value={feature.id}>
              {featureName(feature, index)}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t("layerInspector.paintedMask")}>
        {layer.paintedMask ? (
          <button
            type="button"
            onClick={() => updateLayer(layer.id, { paintedMask: undefined })}
            className="rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("layerInspector.clear")}
          </button>
        ) : (
          <span className="text-muted-foreground">
            {t("layerInspector.none")}
          </span>
        )}
      </Row>

      {layer.mask && (
        <>
          <Row label={t("layerInspector.maskMode")}>
            <select
              value={layer.mask.mode}
              onChange={(e) =>
                patchMask({
                  mode: e.target.value as NonNullable<
                    MorphLayer["mask"]
                  >["mode"],
                })
              }
              className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
            >
              <option value="hard">{t("layerInspector.maskModes.hard")}</option>
              <option value="feathered">
                {t("layerInspector.maskModes.feathered")}
              </option>
            </select>
          </Row>
          <Row label={t("layerInspector.maskFeather")}>
            <input
              type="number"
              min={0}
              max={0.5}
              step={0.01}
              value={layer.mask.feather}
              onChange={(e) => patchMask({ feather: Number(e.target.value) })}
              className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right text-sm"
            />
          </Row>
          <Row label={t("layerInspector.invertMask")}>
            <input
              type="checkbox"
              checked={layer.mask.invert ?? false}
              onChange={() =>
                patchMask({ invert: !(layer.mask?.invert ?? false) })
              }
            />
          </Row>
        </>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("layerInspector.timelineClip")}
        </p>
        <Row label={t("layerInspector.start")}>
          <input
            type="number"
            min={0}
            max={project.timeline.durationSec}
            step={0.1}
            value={clip.startSec}
            onChange={(e) =>
              updateLayer(layer.id, {
                clip: { ...clip, startSec: Number(e.target.value) },
              })
            }
            className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right text-sm"
          />
        </Row>
        <Row label={t("layerInspector.duration")}>
          <input
            type="number"
            min={0.1}
            max={project.timeline.durationSec}
            step={0.1}
            value={clip.durationSec}
            onChange={(e) =>
              updateLayer(layer.id, {
                clip: {
                  ...clip,
                  durationSec: Math.max(0.1, Number(e.target.value)),
                },
              })
            }
            className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right text-sm"
          />
        </Row>
      </div>

      <LayerTransitionControls layer={layer} />

      <p className="text-[11px] leading-4 text-muted-foreground">
        {t("layerInspector.stackPosition", {
          position:
            sortLayers(project.layers).findIndex((x) => x.id === layer.id) + 1,
        })}
      </p>

      <div className="border-t border-destructive/20 pt-3">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10",
            FOCUS_RING,
          )}
        >
          <Trash2 className="size-3.5" />
          {t("layerInspector.delete")}
        </button>
      </div>

      {confirmOpen && (
        <div
          className={cn(
            dialogStyles.overlay,
            "z-[70] flex items-center justify-center p-4",
          )}
        >
          <button
            type="button"
            aria-label={t("layerInspector.closeConfirm")}
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-layer-title"
            aria-describedby="delete-layer-description"
            className={cn(dialogStyles.surface, "relative w-full max-w-md p-6")}
          >
            <h2 id="delete-layer-title" className={dialogStyles.title}>
              {t("layerInspector.confirmTitle")}
            </h2>
            <p
              id="delete-layer-description"
              className={dialogStyles.description}
            >
              {t("layerInspector.confirmBody", { name: layer.name })}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={cn(
                  "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {t("layerInspector.cancel")}
              </button>
              <button
                type="button"
                onClick={remove}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm text-white hover:bg-destructive/90",
                  FOCUS_RING,
                )}
              >
                <Trash2 className="size-3.5" />
                {t("layerInspector.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
