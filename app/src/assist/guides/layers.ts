import { GLOBAL_LAYER_ID } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import type { AssistSnapshot, Guide, L } from "./types";

function openLayersSection(): void {
  const s = useEditorStore.getState();
  s.setTab("studio");
  s.setInspectorSectionOpen("layers", true);
}

const layersHint: L = "guideText.layers.layersHint";

const userLayerActive = ({ editor }: AssistSnapshot): boolean =>
  editor.activeLayerId !== GLOBAL_LAYER_ID;

const activeLayer = ({ editor, project }: AssistSnapshot) =>
  project.project?.layers.find((l) => l.id === editor.activeLayerId);

const needsProject: {
  precondition: (s: AssistSnapshot) => boolean;
  preconditionHint: L;
} = {
  precondition: ({ project }) => project.project !== null,
  preconditionHint: "guideText.layers.needsProject.preconditionHint",
};

const activateLayerStep = {
  id: "activate-layer",
  anchor: "layers.list",
  title: "guideText.layers.activateLayerStep.title",
  body: "guideText.layers.activateLayerStep.body",
  done: userLayerActive,
  navigate: openLayersSection,
  missingHint: layersHint,
} as const;

export const createLayerGuide: Guide = {
  id: "create-layer",
  title: "guideText.layers.createLayerGuide.title",
  description: "guideText.layers.createLayerGuide.description",
  keywords: "guideText.layers.createLayerGuide.keywords",
  category: "layers-masks",
  ...needsProject,
  steps: [
    {
      id: "add",
      anchor: "layers.add",
      title: "guideText.layers.createLayerGuide.steps.add.title",
      body: "guideText.layers.createLayerGuide.steps.add.body",
      done: ({ project }) => (project.project?.layers.length ?? 0) > 1,
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "global-vs-layers",
      anchor: "layers.list",
      title: "guideText.layers.createLayerGuide.steps.global-vs-layers.title",
      body: "guideText.layers.createLayerGuide.steps.global-vs-layers.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "badges",
      anchor: "layers.list",
      title: "guideText.layers.createLayerGuide.steps.badges.title",
      body: "guideText.layers.createLayerGuide.steps.badges.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
  ],
};

export const layerOverrideGuide: Guide = {
  id: "layer-override",
  title: "guideText.layers.layerOverrideGuide.title",
  description: "guideText.layers.layerOverrideGuide.description",
  keywords: "guideText.layers.layerOverrideGuide.keywords",
  category: "layers-masks",
  ...needsProject,
  steps: [
    activateLayerStep,
    {
      id: "override",
      anchor: "layer.algorithmOverride",
      title: "guideText.layers.layerOverrideGuide.steps.override.title",
      body: "guideText.layers.layerOverrideGuide.steps.override.body",
      done: (s) => activeLayer(s)?.algorithmOverride !== undefined,
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "badge",
      anchor: "algorithm.list",
      title: "guideText.layers.layerOverrideGuide.steps.badge.title",
      body: "guideText.layers.layerOverrideGuide.steps.badge.body",
      navigate: () => {
        const s = useEditorStore.getState();
        s.setTab("studio");
        s.setInspectorSectionOpen("algorithm", true);
      },
      missingHint:
        "guideText.layers.layerOverrideGuide.steps.badge.missingHint",
    },
  ],
};

export const maskRegionGuide: Guide = {
  id: "mask-region",
  title: "guideText.layers.maskRegionGuide.title",
  description: "guideText.layers.maskRegionGuide.description",
  keywords: "guideText.layers.maskRegionGuide.keywords",
  category: "layers-masks",
  precondition: ({ project }) =>
    (project.project?.features ?? []).some((f) => f.kind === "region"),
  preconditionHint: "guideText.layers.maskRegionGuide.preconditionHint",
  steps: [
    activateLayerStep,
    {
      id: "assign",
      anchor: "layer.maskSelect",
      title: "guideText.layers.maskRegionGuide.steps.assign.title",
      body: "guideText.layers.maskRegionGuide.steps.assign.body",
      done: (s) => activeLayer(s)?.mask?.featureId !== undefined,
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "modes",
      anchor: "layers.inspector",
      title: "guideText.layers.maskRegionGuide.steps.modes.title",
      body: "guideText.layers.maskRegionGuide.steps.modes.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
  ],
};

export const paintMaskGuide: Guide = {
  id: "paint-mask",
  title: "guideText.layers.paintMaskGuide.title",
  description: "guideText.layers.paintMaskGuide.description",
  keywords: "guideText.layers.paintMaskGuide.keywords",
  category: "layers-masks",
  ...needsProject,
  steps: [
    activateLayerStep,
    {
      id: "pick-brush",
      anchor: "tools.brush",
      title: "guideText.layers.paintMaskGuide.steps.pick-brush.title",
      body: "guideText.layers.paintMaskGuide.steps.pick-brush.body",
      done: ({ editor }) => editor.activeTool === "brush",
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint:
        "guideText.layers.paintMaskGuide.steps.pick-brush.missingHint",
    },
    {
      id: "settings",
      anchor: "brush.controls",
      title: "guideText.layers.paintMaskGuide.steps.settings.title",
      body: "guideText.layers.paintMaskGuide.steps.settings.body",
      navigate: () => useEditorStore.getState().setTool("brush"),
      missingHint: "guideText.layers.paintMaskGuide.steps.settings.missingHint",
    },
    {
      id: "paint",
      anchor: "pane.source",
      title: "guideText.layers.paintMaskGuide.steps.paint.title",
      body: "guideText.layers.paintMaskGuide.steps.paint.body",
      done: (s) => activeLayer(s)?.paintedMask !== undefined,
      navigate: () => {
        const s = useEditorStore.getState();
        s.setTab("studio");
        s.setStudioView("edit");
      },
      missingHint: "guideText.layers.paintMaskGuide.steps.paint.missingHint",
    },
    {
      id: "clear",
      anchor: "layers.inspector",
      title: "guideText.layers.paintMaskGuide.steps.clear.title",
      body: "guideText.layers.paintMaskGuide.steps.clear.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
  ],
};

export const layerLookGuide: Guide = {
  id: "layer-look",
  title: "guideText.layers.layerLookGuide.title",
  description: "guideText.layers.layerLookGuide.description",
  keywords: "guideText.layers.layerLookGuide.keywords",
  category: "layers-masks",
  ...needsProject,
  steps: [
    activateLayerStep,
    {
      id: "opacity",
      anchor: "layer.opacity",
      title: "guideText.layers.layerLookGuide.steps.opacity.title",
      body: "guideText.layers.layerLookGuide.steps.opacity.body",
      done: (s) => (activeLayer(s)?.opacity ?? 1) < 1,
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "blend",
      anchor: "layers.inspector",
      title: "guideText.layers.layerLookGuide.steps.blend.title",
      body: "guideText.layers.layerLookGuide.steps.blend.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "clip",
      anchor: "timeline.tracks",
      title: "guideText.layers.layerLookGuide.steps.clip.title",
      body: "guideText.layers.layerLookGuide.steps.clip.body",
    },
    {
      id: "windows",
      anchor: "layer.transition",
      title: "guideText.layers.layerLookGuide.steps.windows.title",
      body: "guideText.layers.layerLookGuide.steps.windows.body",
      done: (s) => {
        const timing = activeLayer(s)?.timing;
        return (
          timing !== undefined &&
          (timing.dissolveStart > 0.01 || timing.dissolveEnd < 0.99)
        );
      },
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "windows-timeline",
      anchor: "timeline.tracks",
      title: "guideText.layers.layerLookGuide.steps.windows-timeline.title",
      body: "guideText.layers.layerLookGuide.steps.windows-timeline.body",
    },
    {
      id: "easing",
      anchor: "layer.transition",
      title: "guideText.layers.layerLookGuide.steps.easing.title",
      body: "guideText.layers.layerLookGuide.steps.easing.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
    {
      id: "global-too",
      anchor: "layers.list",
      title: "guideText.layers.layerLookGuide.steps.global-too.title",
      body: "guideText.layers.layerLookGuide.steps.global-too.body",
      navigate: openLayersSection,
      missingHint: layersHint,
    },
  ],
};

export const layerGuides: Guide[] = [
  createLayerGuide,
  layerOverrideGuide,
  maskRegionGuide,
  paintMaskGuide,
  layerLookGuide,
];
