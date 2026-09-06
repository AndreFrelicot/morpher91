import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createProjectSpaceTransform } from "@/lib/viewport/projectSpace";
import {
  layerContribution,
  projectAtFeatureTimes,
  videoFrameAvailableAt,
  videoLocalTimeSec,
  type MorphLayer,
  type MorphProject,
  type Vec2,
} from "@/morph/model";
import { usePresentedFrame } from "@/morph/playback/usePresentedFrame";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

/**
 * Non-GPU bits of the morph-preview overlay (PRD M11): the layer-mask coverage
 * debug highlight and the "outside video clip" badges. The feature/handle and
 * mesh/TPS/Beier grid drawing moved to the GPU {@link import("./PreviewOverlay").PreviewOverlay};
 * the coverage fill needs even-odd hole filling (layer debug only), so it stays
 * as a thin SVG layer here.
 */

function mix(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function layerCoverage(
  project: MorphProject,
  layer: MorphLayer,
  t: number,
  tauSec: number,
): { points: Vec2[]; inverted: boolean; status: string } | null {
  const contribution = layerContribution(project, layer, tauSec);
  if (
    contribution.status === "disabled" ||
    contribution.status === "hidden" ||
    contribution.status === "outside-clip" ||
    contribution.status === "no-contribution"
  ) {
    return null;
  }
  if (contribution.status !== "masked" || !layer.mask) {
    return {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      inverted: false,
      status: contribution.status,
    };
  }
  const region = project.features.find(
    (feature) =>
      feature.id === layer.mask?.featureId &&
      feature.kind === "region" &&
      feature.enabled,
  );
  if (!region || region.kind !== "region") return null;
  const count = Math.min(region.a.length, region.b.length);
  if (count < 3) return null;
  return {
    points: Array.from({ length: count }, (_, i) =>
      mix(region.a[i], region.b[i], t),
    ),
    inverted: layer.mask.invert ?? false,
    status: contribution.status,
  };
}

function svgPath(points: Vec2[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")
    .concat(" Z");
}

export function PreviewMorphOverlay() {
  // `t` is taken by the presented-frame morph parameter below.
  const { t: translate } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const project = useProjectStore((s) => s.project);
  // Locked to the presented frame, not the live store τ (PRD M10/M11).
  const { t, tauSec } = usePresentedFrame();
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const debugMode = useEditorStore((s) => s.layerDebugMode);
  const hoveredLayerId = useEditorStore((s) => s.hoveredLayerId);
  const viewport = useEditorStore((s) => s.viewports.preview);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sourceTimeSec = project
    ? videoLocalTimeSec(project, "source", tauSec)
    : 0;
  const targetTimeSec = project
    ? videoLocalTimeSec(project, "target", tauSec)
    : 0;
  const missingSourceFrame = project
    ? !videoFrameAvailableAt(project, "source", tauSec)
    : false;
  const missingTargetFrame = project
    ? !videoFrameAvailableAt(project, "target", tauSec)
    : false;
  const timedProject = useMemo(
    () =>
      project
        ? projectAtFeatureTimes(project, sourceTimeSec, targetTimeSec)
        : null,
    [project, sourceTimeSec, targetTimeSec],
  );

  const transform = useMemo(() => {
    const aspect = timedProject
      ? timedProject.canvas.width / timedProject.canvas.height
      : 1;
    return createProjectSpaceTransform(
      size.w || 1,
      size.h || 1,
      aspect,
      viewport,
    );
  }, [timedProject, size.h, size.w, viewport]);

  const highlightLayerId =
    hoveredLayerId ?? (debugMode === "contribution" ? activeLayerId : null);
  const highlightLayer = highlightLayerId
    ? timedProject?.layers.find((layer) => layer.id === highlightLayerId)
    : undefined;
  const coverage =
    timedProject && highlightLayer
      ? layerCoverage(timedProject, highlightLayer, t, tauSec)
      : null;

  if (
    !timedProject ||
    (!coverage && !missingSourceFrame && !missingTargetFrame)
  ) {
    return <div ref={ref} className="pointer-events-none absolute inset-0" />;
  }

  const coverageScreen = coverage?.points.map(transform.toScreen) ?? [];
  const projectScreen = [
    transform.toScreen({ x: 0, y: 0 }),
    transform.toScreen({ x: 1, y: 0 }),
    transform.toScreen({ x: 1, y: 1 }),
    transform.toScreen({ x: 0, y: 1 }),
  ];

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full">
        {coverage && coverageScreen.length >= 3 && (
          <path
            d={
              coverage.inverted
                ? `${svgPath(projectScreen)} ${svgPath(coverageScreen)}`
                : svgPath(coverageScreen)
            }
            fill={coverage.status === "full-frame" ? "#f59e0b" : "#38bdf8"}
            fillOpacity={coverage.status === "base" ? 0.12 : 0.2}
            fillRule={coverage.inverted ? "evenodd" : undefined}
            stroke={coverage.status === "full-frame" ? "#fbbf24" : "#38bdf8"}
            strokeDasharray={
              coverage.status === "full-frame" ? "6 5" : undefined
            }
            strokeOpacity={0.88}
            strokeWidth={2}
          />
        )}
      </svg>
      {(missingSourceFrame || missingTargetFrame) && (
        <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 rounded border border-border bg-background/85 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {missingSourceFrame && missingTargetFrame
            ? translate("preview.outsideVideoBoth")
            : missingSourceFrame
              ? translate("preview.outsideVideoA")
              : translate("preview.outsideVideoB")}
        </div>
      )}
    </div>
  );
}
