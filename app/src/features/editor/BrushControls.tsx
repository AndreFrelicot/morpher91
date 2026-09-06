import { useNumberFormatter } from "@/i18n/formatters";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { GLOBAL_LAYER_ID } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";

/**
 * Mask brush settings (PRD M11 lot 3), shown under the tool grid while the
 * brush is active. Diameter is a fraction of the canvas min dimension, so the
 * painted size is stable at any zoom; strokes are corrected with the eraser
 * (they are not undo steps).
 */
export function BrushControls() {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const brush = useEditorStore((s) => s.brush);
  const setBrush = useEditorStore((s) => s.setBrush);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);

  return (
    <div className="mt-2 space-y-2" {...assist("brush.controls")}>
      {activeLayerId === GLOBAL_LAYER_ID && (
        <p className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-4 text-amber-100">
          {t("brush.selectLayerHint")}
        </p>
      )}
      <label className="block text-xs">
        <div className="mb-1 flex items-center justify-between text-muted-foreground">
          <span>{t("brush.diameter")}</span>
          <span className="tabular-nums">
            {formatNumber(brush.diameter, 2)}
          </span>
        </div>
        <input
          type="range"
          min={0.01}
          max={0.4}
          step={0.01}
          value={brush.diameter}
          onChange={(e) => setBrush({ diameter: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <label className="block text-xs">
        <div className="mb-1 flex items-center justify-between text-muted-foreground">
          <span>{t("brush.hardness")}</span>
          <span className="tabular-nums">
            {formatNumber(brush.hardness, 2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={brush.hardness}
          onChange={(e) => setBrush({ hardness: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <label className="block text-xs">
        <div className="mb-1 flex items-center justify-between text-muted-foreground">
          <span>{t("brush.strength")}</span>
          <span className="tabular-nums">
            {formatNumber(brush.strength, 2)}
          </span>
        </div>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={brush.strength}
          onChange={(e) => setBrush({ strength: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {t("brush.eraser")}{" "}
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {t("brush.eraserHold")}
          </span>
        </span>
        <input
          type="checkbox"
          checked={brush.erase}
          onChange={() => setBrush({ erase: !brush.erase })}
        />
      </label>
    </div>
  );
}
