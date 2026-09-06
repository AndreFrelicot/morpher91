import { layerName } from "@/features/editor/layerName";
import { ChevronLeft, ChevronRight, Diamond, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  featureKeyframeTimes,
  GLOBAL_LAYER_ID,
  KEYFRAME_EPSILON_SEC,
  hasFeatureKeyframeAt,
  removeFeatureKeyframe,
  setFeatureKeyframe,
  sortLayers,
  timelineDurationSec,
  videoClipStatus,
  videoLocalTimeSec,
  videoMasterTimeSec,
  type FeaturePair,
  type NormalizedVec2,
} from "@/morph/model";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { useFrameTauSec } from "@/store/useFrameTauSec";
import {
  beginEdit,
  commitEdit,
  commitFeatureChange,
  deleteFeatures,
} from "./featureCommit";
import { featureName } from "./featureName";
import {
  ACTION_ARIA_SHORTCUTS,
  ACTION_SHORTCUT_LABELS,
  tooltipWithShortcut,
} from "./useKeyboardShortcuts";

const SEMANTICS = [
  "left-eye",
  "right-eye",
  "nose",
  "mouth",
  "chin",
  "jaw",
  "hairline",
  "custom",
] as const;

const REGION_ROLES = [
  "face",
  "hair",
  "neck",
  "body",
  "background",
  "custom",
] as const;

const fmt = (p: NormalizedVec2) => `${p.x.toFixed(3)}, ${p.y.toFixed(3)}`;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Coordinates({ feature }: { feature: FeaturePair }) {
  const { t } = useTranslation();
  const lines: [string, string][] = [];
  switch (feature.kind) {
    case "point":
      lines.push(["A", fmt(feature.a)], ["B", fmt(feature.b)]);
      break;
    case "segment":
      lines.push(
        ["A0", fmt(feature.a0)],
        ["A1", fmt(feature.a1)],
        ["B0", fmt(feature.b0)],
        ["B1", fmt(feature.b1)],
      );
      break;
    case "polyline":
    case "region":
      lines.push(
        ["A", t("features.pts", { count: feature.a.length })],
        ["B", t("features.pts", { count: feature.b.length })],
      );
      break;
  }
  return (
    <div className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
      {lines.map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <span>{k}</span>
          <bdi
            dir={
              feature.kind === "point" || feature.kind === "segment"
                ? "ltr"
                : "auto"
            }
          >
            {v}
          </bdi>
        </div>
      ))}
    </div>
  );
}

/**
 * Keyframe navigation (M25): per side, previous / toggle-at-τ / next plus the
 * keyframe count. Times live in side-local video seconds; the timeline shows
 * the same keyframes as diamonds on the A/B tracks. Posing captures the shape
 * sampled at that time (the previous keyframe propagates), ready to adjust
 * with drag/Push.
 */
function KeyframesSection({ feature }: { feature: FeaturePair }) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  // Frame-quantized: the toggle state only changes at frame granularity.
  const tauSec = useFrameTauSec();
  const setTimelineTime = useEditorStore((s) => s.setTimelineTime);
  if (!project) return null;
  const hasVideo = Boolean(project.videos?.source || project.videos?.target);

  const sides = [
    { side: "a", slot: "source", label: "A" },
    { side: "b", slot: "target", label: "B" },
  ] as const;
  const jump = (slot: "source" | "target", localSec: number) =>
    setTimelineTime(
      videoMasterTimeSec(project, slot, localSec),
      timelineDurationSec(project),
    );
  const navButton =
    "inline-flex size-5 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {t("features.keyframes")}
      </p>
      <div className="space-y-1.5">
        {sides.map(({ side, slot, label }) => {
          const times = featureKeyframeTimes(feature, side);
          const localNow = videoLocalTimeSec(project, slot, tauSec);
          const atNow = hasFeatureKeyframeAt(feature, side, localNow);
          const previous = [...times]
            .reverse()
            .find((time) => time < localNow - KEYFRAME_EPSILON_SEC);
          const next = times.find(
            (time) => time > localNow + KEYFRAME_EPSILON_SEC,
          );
          const video = project.videos?.[slot];
          const clipActive =
            !video || videoClipStatus(video, tauSec) === "active";
          return (
            <div key={side} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-muted-foreground">{label}</span>
              <div dir="ltr" className="flex items-center gap-1">
                <button
                  type="button"
                  title={t("features.prevKeyframe", { side: label })}
                  aria-label={t("features.prevKeyframe", { side: label })}
                  disabled={previous === undefined}
                  onClick={() => previous !== undefined && jump(slot, previous)}
                  className={cn(navButton, FOCUS_RING)}
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  title={t("features.toggleKeyframe", { side: label })}
                  aria-label={t("features.toggleKeyframe", { side: label })}
                  aria-pressed={atNow}
                  disabled={feature.locked || !clipActive}
                  onClick={() => {
                    const patch = atNow
                      ? removeFeatureKeyframe(feature, side, localNow)
                      : setFeatureKeyframe(feature, side, localNow);
                    if (patch) commitFeatureChange(feature.id, patch);
                  }}
                  className={cn(
                    navButton,
                    FOCUS_RING,
                    atNow &&
                      "border-primary/60 bg-primary/20 text-primary hover:bg-primary/30",
                  )}
                >
                  <Diamond className={cn("size-3", atNow && "fill-current")} />
                </button>
                <button
                  type="button"
                  title={t("features.nextKeyframe", { side: label })}
                  aria-label={t("features.nextKeyframe", { side: label })}
                  disabled={next === undefined}
                  onClick={() => next !== undefined && jump(slot, next)}
                  className={cn(navButton, FOCUS_RING)}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {times.length === 0
                  ? t("features.noKeyframes")
                  : t("features.keyframeCount", { count: times.length })}
              </span>
            </div>
          );
        })}
      </div>
      {!hasVideo &&
        featureKeyframeTimes(feature, "a").length === 0 &&
        featureKeyframeTimes(feature, "b").length === 0 && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
            {t("features.keyframeHintStill")}
          </p>
        )}
    </div>
  );
}

function SingleFeature({
  feature,
  index,
}: {
  feature: FeaturePair;
  index: number;
}) {
  const { t } = useTranslation();
  const update = useProjectStore((s) => s.updateFeature);
  const project = useProjectStore((s) => s.project);
  const setFeatureLayer = useProjectStore((s) => s.setFeatureLayer);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t(`features.kinds.${feature.kind}`)}
        </p>
        <input
          type="text"
          value={feature.label ?? ""}
          placeholder={featureName(feature, index)}
          onFocus={beginEdit}
          onChange={(e) => update(feature.id, { label: e.target.value })}
          onBlur={commitEdit}
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </div>

      <Row label={t("features.visible")}>
        <input
          type="checkbox"
          checked={feature.enabled}
          onChange={() =>
            commitFeatureChange(feature.id, { enabled: !feature.enabled })
          }
        />
      </Row>
      <Row label={t("features.locked")}>
        <input
          type="checkbox"
          checked={feature.locked ?? false}
          onChange={() =>
            commitFeatureChange(feature.id, { locked: !feature.locked })
          }
        />
      </Row>
      <Row label={t("features.weight")}>
        <input
          type="number"
          step={0.1}
          min={0}
          value={feature.weight ?? 1}
          onFocus={beginEdit}
          onChange={(e) =>
            update(feature.id, { weight: Number(e.target.value) })
          }
          onBlur={commitEdit}
          className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right text-sm"
        />
      </Row>

      {project && (
        <Row label={t("features.layer")}>
          <select
            value={feature.layerId ?? GLOBAL_LAYER_ID}
            onChange={(e) => setFeatureLayer(feature.id, e.target.value)}
            className="max-w-40 rounded border border-border bg-background px-1 py-0.5 text-xs"
          >
            {sortLayers(project.layers).map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layerName(layer)}
              </option>
            ))}
          </select>
        </Row>
      )}

      {feature.kind === "point" && (
        <Row label={t("features.landmark")}>
          <select
            value={feature.semantic ?? ""}
            onChange={(e) =>
              commitFeatureChange(feature.id, {
                semantic: (e.target.value || undefined) as
                  | (typeof SEMANTICS)[number]
                  | undefined,
              })
            }
            className="rounded border border-border bg-background px-1 py-0.5 text-xs"
          >
            <option value="">{t("features.none")}</option>
            {SEMANTICS.map((s) => (
              <option key={s} value={s}>
                {t(`features.semantics.${s}`)}
              </option>
            ))}
          </select>
        </Row>
      )}

      {feature.kind === "region" && (
        <>
          <Row label={t("features.role")}>
            <select
              value={feature.role ?? ""}
              onChange={(e) =>
                commitFeatureChange(feature.id, {
                  role: (e.target.value || undefined) as
                    | (typeof REGION_ROLES)[number]
                    | undefined,
                })
              }
              className="rounded border border-border bg-background px-1 py-0.5 text-xs"
            >
              <option value="">{t("features.none")}</option>
              {REGION_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`features.roles.${role}`)}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t("features.feather")}>
            <input
              type="number"
              step={0.01}
              min={0}
              max={0.5}
              value={feature.feather}
              onFocus={beginEdit}
              onChange={(e) =>
                update(feature.id, { feather: Number(e.target.value) })
              }
              onBlur={commitEdit}
              className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right text-sm"
            />
          </Row>
        </>
      )}

      <KeyframesSection feature={feature} />

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("features.coordinates")}
        </p>
        <Coordinates feature={feature} />
      </div>
    </div>
  );
}

/** Right-inspector contents when one or more features are selected. */
export function FeatureInspector() {
  const { t } = useTranslation();
  const features = useProjectStore((s) => s.project?.features) ?? [];
  const selection = useEditorStore((s) => s.selection);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const selected = features
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => selection.includes(f.id));

  if (selected.length === 1) {
    return <SingleFeature feature={selected[0].f} index={selected[0].i} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("features.selectedCount", { count: selected.length })}
      </p>
      <button
        type="button"
        title={tooltipWithShortcut(
          t("features.deleteSelected"),
          ACTION_SHORTCUT_LABELS.deleteSelection,
        )}
        aria-keyshortcuts={ACTION_ARIA_SHORTCUTS.deleteSelection}
        onClick={() => {
          deleteFeatures(selection);
          clearSelection();
        }}
        className={cn(
          "flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <Trash2 className="size-3.5" /> {t("features.deleteSelected")}
      </button>
    </div>
  );
}
