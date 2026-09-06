import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import {
  NAMED_EASINGS,
  type Easing,
  type LayerTiming,
  type MorphLayer,
} from "@/morph/model";
import { BezierEditor } from "@/ui/components/BezierEditor";
import { RangeWindowInput } from "@/ui/components/RangeWindowInput";
import { useProjectStore } from "@/store/projectStore";
import {
  applyTransitionPreset,
  matchTransitionPreset,
  NAMED_EASING_HANDLES,
  normalizeWindow,
  TRANSITION_PRESET_IDS,
  type TransitionPresetId,
} from "./transitionPresets";

/**
 * Warp and dissolve windows of one layer, in percent of its clip (PRD §9.2).
 * Shared by the user-layer inspector and the Global layer.
 */
export function LayerTransitionControls({ layer }: { layer: MorphLayer }) {
  const { t } = useTranslation();
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const timing = layer.timing;

  const patch = (next: Partial<LayerTiming>) =>
    updateLayer(layer.id, { timing: { ...timing, ...next } });

  const setWarp = (window: { start: number; end: number }) =>
    patch({ warpStart: window.start, warpEnd: window.end });
  const setDissolve = (window: { start: number; end: number }) =>
    patch({ dissolveStart: window.start, dissolveEnd: window.end });

  return (
    <div
      className="space-y-2 border-t border-border pt-3"
      {...assist("layer.transition")}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {t("layerInspector.transition")}
      </p>

      <WindowField
        label={t("layerInspector.warpWindow")}
        startLabel={t("layerInspector.warpStart")}
        endLabel={t("layerInspector.warpEnd")}
        start={timing.warpStart}
        end={timing.warpEnd}
        onChange={setWarp}
      />
      <WindowField
        label={t("layerInspector.dissolveWindow")}
        startLabel={t("layerInspector.dissolveStart")}
        endLabel={t("layerInspector.dissolveEnd")}
        start={timing.dissolveStart}
        end={timing.dissolveEnd}
        onChange={setDissolve}
      />

      <EasingField
        label={t("layerInspector.easing")}
        value={timing.easing}
        onChange={(easing) => patch({ easing })}
      />

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {t("layerInspector.distinctDissolveEasing")}
        </span>
        <input
          type="checkbox"
          checked={timing.dissolveEasing !== undefined}
          onChange={(e) =>
            updateLayer(layer.id, {
              timing: e.target.checked
                ? { ...timing, dissolveEasing: timing.easing }
                : withoutDissolveEasing(timing),
            })
          }
        />
      </label>

      {timing.dissolveEasing !== undefined && (
        <EasingField
          label={t("layerInspector.dissolveEasing")}
          value={timing.dissolveEasing}
          onChange={(dissolveEasing) => patch({ dissolveEasing })}
        />
      )}

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {t("layerInspector.presets.label")}
        </span>
        <select
          value={matchTransitionPreset(timing)}
          onChange={(e) => {
            const id = e.target.value as TransitionPresetId;
            if (id === "custom") return;
            updateLayer(layer.id, {
              timing: applyTransitionPreset(timing, id),
            });
          }}
          className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
        >
          {TRANSITION_PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`layerInspector.presets.${id}`)}
            </option>
          ))}
          <option value="custom">{t("layerInspector.presets.custom")}</option>
        </select>
      </label>
    </div>
  );
}

/** Drops `dissolveEasing` so the dissolve falls back to the shared curve. */
function withoutDissolveEasing(timing: LayerTiming): LayerTiming {
  const next = { ...timing };
  delete next.dissolveEasing;
  return next;
}

/** Named curve or a hand-drawn cubic-bezier, sharing one select (M24 lot 3). */
function EasingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Easing;
  onChange: (easing: Easing) => void;
}) {
  const { t } = useTranslation();
  const isBezier = typeof value !== "string";

  return (
    <div className="space-y-1">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <select
          value={isBezier ? "bezier" : value}
          onChange={(e) => {
            const next = e.target.value;
            if (next !== "bezier") {
              onChange(next as Easing);
              return;
            }
            // Seed the handles from the curve currently in effect.
            onChange(isBezier ? value : { ...NAMED_EASING_HANDLES[value] });
          }}
          className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
        >
          {NAMED_EASINGS.map((easing) => (
            <option key={easing} value={easing}>
              {t(`layerInspector.easings.${easing}`)}
            </option>
          ))}
          <option value="bezier">{t("layerInspector.easings.bezier")}</option>
        </select>
      </label>
      {isBezier && (
        <div className="flex items-start gap-2">
          <BezierEditor
            value={value}
            onChange={onChange}
            label={t("layerInspector.bezierCurve", { name: label })}
            handleLabels={[
              t("layerInspector.bezierHandle1"),
              t("layerInspector.bezierHandle2"),
            ]}
          />
          <div dir="ltr" className="grid grid-cols-2 gap-1">
            {(["x1", "y1", "x2", "y2"] as const).map((axis) => (
              <input
                key={axis}
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={round2(value[axis])}
                aria-label={t(`layerInspector.bezier.${axis}`)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [axis]: clamp01(Number(e.target.value)),
                  })
                }
                className="w-14 rounded border border-border bg-background px-1 py-0.5 text-right text-xs"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const round2 = (value: number) => Math.round(value * 100) / 100;

function WindowField({
  label,
  startLabel,
  endLabel,
  start,
  end,
  onChange,
}: {
  label: string;
  startLabel: string;
  endLabel: string;
  start: number;
  end: number;
  onChange: (window: { start: number; end: number }) => void;
}) {
  const percent = (value: number) => Math.round(value * 100);
  const commit = (raw: number, moved: "start" | "end") =>
    onChange(
      normalizeWindow(
        moved === "start" ? raw / 100 : start,
        moved === "end" ? raw / 100 : end,
        moved,
      ),
    );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span dir="ltr" className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={percent(start)}
            aria-label={startLabel}
            onChange={(e) => commit(Number(e.target.value), "start")}
            className="w-14 rounded border border-border bg-background px-1 py-0.5 text-right text-sm"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={percent(end)}
            aria-label={endLabel}
            onChange={(e) => commit(Number(e.target.value), "end")}
            className="w-14 rounded border border-border bg-background px-1 py-0.5 text-right text-sm"
          />
        </span>
      </div>
      <RangeWindowInput
        start={start}
        end={end}
        onChange={onChange}
        startLabel={startLabel}
        endLabel={endLabel}
      />
    </div>
  );
}
