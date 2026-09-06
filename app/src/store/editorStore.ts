import { create } from "zustand";
import {
  GLOBAL_LAYER_ID,
  type FeatureId,
  type FeatureSide,
  type LayerId,
  type Vec2,
} from "@/morph/model";
import type { LayerDebugMode, OverlayLayerScope } from "@/morph/layers/debug";

/** Handle under the pointer, shared so BOTH panes show the correspondence. */
export type HandleHover = {
  featureId: FeatureId;
  /** Vertex key within the feature (null = feature-level hover). */
  handleKey: string | null;
  /** Pane the pointer is in. */
  side: FeatureSide;
};

/** One-shot expanding-ring animation on specific handles (e.g. polygon close). */
export type BeaconBurst = {
  featureId: FeatureId;
  handleKeys: string[];
  /** performance.now() at trigger; panes animate for a fixed duration. */
  startedAt: number;
};

export type AppTab = "studio" | "compare";

export type EditorTool =
  | "select"
  | "point"
  | "line"
  | "polyline"
  | "region"
  | "brush"
  | "push"
  | "pan";

/** Mask brush options (PRD M11 lot 3). Diameter is a fraction of the canvas
 * min dimension (project space), so the painted size is zoom-stable. */
export type BrushSettings = {
  diameter: number;
  hardness: number;
  strength: number;
  erase: boolean;
};

export type SelectionMode = "replace" | "add" | "toggle";

/** Studio surface: split editor, WebGPU preview, or source | preview | target. */
export type StudioView = "edit" | "preview" | "triple";

/** Right-inspector stacked sections (M14): all rendered, individually collapsible. */
export type InspectorSectionId = "algorithm" | "layers" | "selection";

/** Collapsible shell panels: left sidebar, right inspector, timeline dock. */
export type ShellPanelId = "left" | "right" | "timeline";

/** Per-pane viewport (zoom around the pane center, pan in px). */
export type Viewport = { zoom: number; pan: Vec2 };

/** The three studio panes that can be zoomed/panned. */
export type ViewportSlot = "source" | "preview" | "target";

const defaultViewports = (): Record<ViewportSlot, Viewport> => ({
  source: { zoom: 1, pan: { x: 0, y: 0 } },
  preview: { zoom: 1, pan: { x: 0, y: 0 } },
  target: { zoom: 1, pan: { x: 0, y: 0 } },
});

export type PreviewOverlays = {
  features: boolean;
  mesh: boolean;
  tpsGrid: boolean;
  beierField: boolean;
};

export type ViewportOverlaySlot = "source" | "preview" | "target";

export type ViewportOverlays = Record<ViewportOverlaySlot, PreviewOverlays>;

const defaultViewportOverlays = (): ViewportOverlays => ({
  source: {
    features: true,
    mesh: false,
    tpsGrid: false,
    beierField: false,
  },
  preview: {
    features: true,
    mesh: false,
    tpsGrid: false,
    beierField: false,
  },
  target: {
    features: true,
    mesh: false,
    tpsGrid: false,
    beierField: false,
  },
});

export type EditorState = {
  activeTab: AppTab;
  activeTool: EditorTool;
  /** Current normalized morph progress, kept for static-image compatibility. */
  t: number;
  /** Current master timeline time in seconds. */
  tauSec: number;
  playing: boolean;
  studioView: StudioView;
  activeLayerId: LayerId;
  /** Open/collapsed state of each right-inspector section (persists across tabs). */
  inspectorSections: Record<InspectorSectionId, boolean>;
  /** Open/collapsed state of the shell panels (left rail panel, inspector, timeline). */
  panelsOpen: Record<ShellPanelId, boolean>;
  /** Zen mode (Tab): every shell panel collapsed, canvas only. */
  zen: boolean;
  /** Overlay chrome hidden (U): no labels, toolbars or HUD panels over the viewports. */
  overlayChromeHidden: boolean;
  /** Demo-assets dialog (M15), openable from the TopBar and empty states. */
  demoDialogOpen: boolean;
  /** Export dialog, opened from the TopBar (modal: the run button never scrolls away). */
  exportDialogOpen: boolean;
  selection: FeatureId[];
  brush: BrushSettings;
  viewports: Record<ViewportSlot, Viewport>;
  /** True (default): zoom/pan gestures move every pane; false: per-pane views. */
  viewportsLinked: boolean;
  viewportOverlays: ViewportOverlays;
  layerDebugMode: LayerDebugMode;
  overlayLayerScope: OverlayLayerScope;
  showLayerStack: boolean;
  hoveredLayerId: LayerId | null;
  hover: HandleHover | null;
  beaconBurst: BeaconBurst | null;
  setTab: (tab: AppTab) => void;
  setTool: (tool: EditorTool) => void;
  setBrush: (patch: Partial<BrushSettings>) => void;
  setStudioView: (view: StudioView) => void;
  setActiveLayer: (id: LayerId) => void;
  setInspectorSectionOpen: (id: InspectorSectionId, open: boolean) => void;
  setPanelOpen: (id: ShellPanelId, open: boolean) => void;
  setZen: (zen: boolean) => void;
  setOverlayChromeHidden: (hidden: boolean) => void;
  setDemoDialogOpen: (open: boolean) => void;
  setExportDialogOpen: (open: boolean) => void;
  setLayerDebugMode: (mode: LayerDebugMode) => void;
  setOverlayLayerScope: (scope: OverlayLayerScope) => void;
  setShowLayerStack: (show: boolean) => void;
  setHoveredLayer: (id: LayerId | null) => void;
  setHover: (hover: HandleHover | null) => void;
  triggerBeaconBurst: (featureId: FeatureId, handleKeys: string[]) => void;
  setT: (t: number) => void;
  setTimelineTime: (tauSec: number, durationSec: number) => void;
  setPlaying: (playing: boolean) => void;
  resetEditor: () => void;
  selectFeature: (id: FeatureId, mode?: SelectionMode) => void;
  clearSelection: () => void;
  setViewport: (slot: ViewportSlot, patch: Partial<Viewport>) => void;
  setViewportsLinked: (linked: boolean) => void;
  setViewportOverlays: (
    slot: ViewportOverlaySlot,
    patch: Partial<PreviewOverlays>,
  ) => void;
};

const editorResetState = () =>
  ({
    activeTab: "studio",
    activeTool: "select",
    t: 0,
    tauSec: 0,
    playing: false,
    studioView: "edit",
    activeLayerId: GLOBAL_LAYER_ID,
    inspectorSections: { algorithm: true, layers: true, selection: true },
    panelsOpen: { left: true, right: true, timeline: true },
    zen: false,
    overlayChromeHidden: false,
    demoDialogOpen: false,
    exportDialogOpen: false,
    selection: [],
    brush: { diameter: 0.08, hardness: 0.5, strength: 1, erase: false },
    viewports: defaultViewports(),
    viewportsLinked: true,
    viewportOverlays: defaultViewportOverlays(),
    layerDebugMode: "composite",
    overlayLayerScope: "selected",
    showLayerStack: false,
    hoveredLayerId: null,
    hover: null,
    beaconBurst: null,
  }) satisfies Partial<EditorState>;

export const useEditorStore = create<EditorState>((set) => ({
  ...editorResetState(),
  setTab: (activeTab) => set({ activeTab }),
  setTool: (activeTool) => set({ activeTool }),
  setBrush: (patch) => set((s) => ({ brush: { ...s.brush, ...patch } })),
  setStudioView: (studioView) => set({ studioView }),
  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  setInspectorSectionOpen: (id, open) =>
    set((s) => ({
      inspectorSections: { ...s.inspectorSections, [id]: open },
    })),
  setPanelOpen: (id, open) =>
    set((s) => ({
      panelsOpen: { ...s.panelsOpen, [id]: open },
      // Manually reopening a panel leaves zen mode.
      zen: open ? false : s.zen,
    })),
  setZen: (zen) =>
    set({
      zen,
      panelsOpen: { left: !zen, right: !zen, timeline: !zen },
    }),
  setOverlayChromeHidden: (overlayChromeHidden) => set({ overlayChromeHidden }),
  setDemoDialogOpen: (demoDialogOpen) => set({ demoDialogOpen }),
  setExportDialogOpen: (exportDialogOpen) => set({ exportDialogOpen }),
  setLayerDebugMode: (layerDebugMode) => set({ layerDebugMode }),
  setOverlayLayerScope: (overlayLayerScope) => set({ overlayLayerScope }),
  setShowLayerStack: (showLayerStack) => set({ showLayerStack }),
  setHoveredLayer: (hoveredLayerId) => set({ hoveredLayerId }),
  setHover: (hover) => set({ hover }),
  triggerBeaconBurst: (featureId, handleKeys) =>
    set({
      beaconBurst: { featureId, handleKeys, startedAt: performance.now() },
    }),
  setT: (t) => set({ t }),
  setTimelineTime: (tauSec, durationSec) =>
    set({
      tauSec: Math.min(durationSec, Math.max(0, tauSec)),
      t: durationSec > 0 ? Math.min(1, Math.max(0, tauSec / durationSec)) : 0,
    }),
  setPlaying: (playing) => set({ playing }),
  resetEditor: () => set(editorResetState()),
  selectFeature: (id, mode = "replace") =>
    set((s) => {
      if (mode === "add") {
        return s.selection.includes(id)
          ? s
          : { selection: [...s.selection, id] };
      }
      if (mode === "toggle") {
        return {
          selection: s.selection.includes(id)
            ? s.selection.filter((x) => x !== id)
            : [...s.selection, id],
        };
      }
      return { selection: [id] };
    }),
  clearSelection: () => set({ selection: [] }),
  setViewport: (slot, patch) =>
    set((s) => {
      const next = { ...s.viewports[slot], ...patch };
      return {
        viewports: s.viewportsLinked
          ? { source: next, preview: next, target: next }
          : { ...s.viewports, [slot]: next },
      };
    }),
  setViewportsLinked: (viewportsLinked) => set({ viewportsLinked }),
  setViewportOverlays: (slot, patch) =>
    set((s) => ({
      viewportOverlays: {
        ...s.viewportOverlays,
        [slot]: { ...s.viewportOverlays[slot], ...patch },
      },
    })),
}));
