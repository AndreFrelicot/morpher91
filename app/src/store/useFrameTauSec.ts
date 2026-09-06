import { useEditorStore } from "./editorStore";
import { useProjectStore } from "./projectStore";

/**
 * τ quantized to the timeline's display step (one video frame). Components
 * showing frame-granular state re-render once per frame step during a scrub
 * instead of once per pointer event (~120 Hz on a trackpad).
 */
export function useFrameTauSec(): number {
  const fps = useProjectStore((s) => s.project?.timeline.fps ?? 30);
  return useEditorStore((s) => Math.round(s.tauSec * fps) / fps);
}
