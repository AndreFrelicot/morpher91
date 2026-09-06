import type { FeaturePair, FeatureSide, LayerId } from "@/morph/model";
import type { ProjectSpaceTransform } from "@/lib/viewport/projectSpace";

/**
 * Per-pane data + imperative bridges a tool needs (PRD M11 lot 2). Rebuilt each
 * render and handed to the {@link ToolController}, so tool modules stay free of
 * React and the DOM. Geometry mutations go through the project/history stores
 * (imported directly by the tools, as the old FeaturePane did) so undo/redo and
 * the temporal keyframe tracks keep working unchanged.
 */
export type ToolContext = {
  side: FeatureSide;
  transform: ProjectSpaceTransform;
  /** Features sampled at the presented frame (the positions tools hit-test/draw). */
  features: FeaturePair[];
  activeLayerId: LayerId;
  /** Active layer is enabled, visible and unlocked ⇒ new geometry is allowed. */
  activeLayerEditable: boolean;
  showFeatures: boolean;
  /** Feature id currently under the pointer (drives hover styling + cursor). */
  hoveredId: string | null;
  /** Temporal media present ⇒ handle drags write keyframe tracks. */
  hasTemporalMedia: boolean;
  /** This side's local video time, for keyframe tracks. */
  sideTimeSec: number;
  /** Space bar held ⇒ the gesture pans regardless of the active tool. */
  spaceHeld: boolean;
  /** Set the hovered feature id + handle key (drives hover styling, the
   * cross-pane beacon and the HUD). */
  setHovered: (id: string | null, handleKey?: string | null) => void;
};
