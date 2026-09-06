import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProjectSpaceTransform } from "@/lib/viewport/projectSpace";
import { projectAtFeatureTimes, videoLocalTimeSec } from "@/morph/model";
import type { OverlayFrame } from "@/morph/overlay/overlayTransform";
import { emptyScene } from "@/morph/overlay/scene";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { OverlayCanvas } from "./OverlayCanvas";
import { buildPreviewScene } from "./overlay/buildEditorScene";
import type { OverlayPalette } from "./overlay/resolveOverlayColors";

/**
 * GPU interaction overlay for the centre morph preview (PRD M11) — the feature +
 * mesh/TPS/Beier drawing that used to live in PreviewMorphOverlay's SVG. Reads
 * the same stores, samples features at the current per-side video times, and
 * draws the interpolated scene through {@link OverlayCanvas}. The layer-coverage
 * debug highlight and missing-frame badges stay in PreviewMorphOverlay.
 */
export function PreviewOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const project = useProjectStore((s) => s.project);
  const overlays = useEditorStore((s) => s.viewportOverlays.preview);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const overlayScope = useEditorStore((s) => s.overlayLayerScope);
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

  const transform = useMemo(() => {
    const aspect = project ? project.canvas.width / project.canvas.height : 1;
    return createProjectSpaceTransform(
      size.w || 1,
      size.h || 1,
      aspect,
      viewport,
    );
  }, [project, size.h, size.w, viewport]);

  const frame: OverlayFrame = {
    content: transform.content,
    cssWidth: size.w,
    cssHeight: size.h,
  };

  const build = useCallback(
    (palette: OverlayPalette, { t, tauSec }: { t: number; tauSec: number }) => {
      if (!project) return emptyScene();
      const timedProject = projectAtFeatureTimes(
        project,
        videoLocalTimeSec(project, "source", tauSec),
        videoLocalTimeSec(project, "target", tauSec),
      );
      return buildPreviewScene({
        project: timedProject,
        t,
        tauSec,
        activeLayerId,
        overlayScope,
        overlays,
        palette,
      });
    },
    [project, activeLayerId, overlayScope, overlays],
  );

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {project && <OverlayCanvas frame={frame} build={build} />}
    </div>
  );
}
