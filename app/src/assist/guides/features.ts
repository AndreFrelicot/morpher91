import { useEditorStore } from "@/store/editorStore";
import type { AssistSnapshot, Guide, L } from "./types";

function goToEdit(): void {
  const s = useEditorStore.getState();
  s.setTab("studio");
  s.setStudioView("edit");
}

function openSelectionSection(): void {
  const s = useEditorStore.getState();
  s.setTab("studio");
  s.setInspectorSectionOpen("selection", true);
}

const hasFeatureKind =
  (kind: "point" | "segment" | "polyline" | "region") =>
  ({ project }: AssistSnapshot): boolean =>
    (project.project?.features ?? []).some((f) => f.kind === kind);

const needsProject: {
  precondition: (s: AssistSnapshot) => boolean;
  preconditionHint: L;
} = {
  precondition: ({ project }) => project.project !== null,
  preconditionHint: "guideText.features.needsProject.preconditionHint",
};

const studioHint: L = "guideText.features.studioHint";

export const placePointsGuide: Guide = {
  id: "place-points",
  title: "guideText.features.placePointsGuide.title",
  description: "guideText.features.placePointsGuide.description",
  keywords: "guideText.features.placePointsGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "pick-tool",
      anchor: "tools.point",
      title: "guideText.features.placePointsGuide.steps.pick-tool.title",
      body: "guideText.features.placePointsGuide.steps.pick-tool.body",
      done: ({ editor }) => editor.activeTool === "point",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "place-a",
      anchor: "pane.source",
      title: "guideText.features.placePointsGuide.steps.place-a.title",
      body: "guideText.features.placePointsGuide.steps.place-a.body",
      done: hasFeatureKind("point"),
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "adjust-b",
      anchor: "pane.target",
      title: "guideText.features.placePointsGuide.steps.adjust-b.title",
      body: "guideText.features.placePointsGuide.steps.adjust-b.body",
      done: ({ project }) =>
        (project.project?.features ?? []).some(
          (f) => f.kind === "point" && (f.a.x !== f.b.x || f.a.y !== f.b.y),
        ),
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "preview",
      anchor: "view.toggle",
      title: "guideText.features.placePointsGuide.steps.preview.title",
      body: "guideText.features.placePointsGuide.steps.preview.body",
      done: ({ editor }) => editor.studioView !== "edit",
      navigate: goToEdit,
      missingHint: studioHint,
    },
  ],
};

export const drawLinesGuide: Guide = {
  id: "draw-lines",
  title: "guideText.features.drawLinesGuide.title",
  description: "guideText.features.drawLinesGuide.description",
  keywords: "guideText.features.drawLinesGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "pick-tool",
      anchor: "tools.line",
      title: "guideText.features.drawLinesGuide.steps.pick-tool.title",
      body: "guideText.features.drawLinesGuide.steps.pick-tool.body",
      done: ({ editor }) => editor.activeTool === "line",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "drag-line",
      anchor: "pane.source",
      title: "guideText.features.drawLinesGuide.steps.drag-line.title",
      body: "guideText.features.drawLinesGuide.steps.drag-line.body",
      done: hasFeatureKind("segment"),
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "orient-b",
      anchor: "pane.target",
      title: "guideText.features.drawLinesGuide.steps.orient-b.title",
      body: "guideText.features.drawLinesGuide.steps.orient-b.body",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "use-beier",
      anchor: "algorithm.list",
      title: "guideText.features.drawLinesGuide.steps.use-beier.title",
      body: "guideText.features.drawLinesGuide.steps.use-beier.body",
      done: ({ project }) => project.activeAlgorithm === "beier-neely",
      navigate: () => {
        const s = useEditorStore.getState();
        s.setTab("studio");
        s.setInspectorSectionOpen("algorithm", true);
      },
      missingHint:
        "guideText.features.drawLinesGuide.steps.use-beier.missingHint",
    },
  ],
};

export const drawPolylineGuide: Guide = {
  id: "draw-polyline",
  title: "guideText.features.drawPolylineGuide.title",
  description: "guideText.features.drawPolylineGuide.description",
  keywords: "guideText.features.drawPolylineGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "pick-tool",
      anchor: "tools.polyline",
      title: "guideText.features.drawPolylineGuide.steps.pick-tool.title",
      body: "guideText.features.drawPolylineGuide.steps.pick-tool.body",
      done: ({ editor }) => editor.activeTool === "polyline",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "tap-by-tap",
      anchor: "pane.source",
      title: "guideText.features.drawPolylineGuide.steps.tap-by-tap.title",
      body: "guideText.features.drawPolylineGuide.steps.tap-by-tap.body",
      done: hasFeatureKind("polyline"),
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "freehand",
      anchor: "pane.source",
      title: "guideText.features.drawPolylineGuide.steps.freehand.title",
      body: "guideText.features.drawPolylineGuide.steps.freehand.body",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "resume",
      anchor: "pane.source",
      title: "guideText.features.drawPolylineGuide.steps.resume.title",
      body: "guideText.features.drawPolylineGuide.steps.resume.body",
      navigate: goToEdit,
      missingHint: studioHint,
    },
  ],
};

export const closePolygonGuide: Guide = {
  id: "close-polygon",
  title: "guideText.features.closePolygonGuide.title",
  description: "guideText.features.closePolygonGuide.description",
  keywords: "guideText.features.closePolygonGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "intro",
      anchor: null,
      title: "guideText.features.closePolygonGuide.steps.intro.title",
      body: "guideText.features.closePolygonGuide.steps.intro.body",
    },
    {
      id: "close-first",
      anchor: "pane.source",
      title: "guideText.features.closePolygonGuide.steps.close-first.title",
      body: "guideText.features.closePolygonGuide.steps.close-first.body",
      done: ({ project }) =>
        (project.project?.features ?? []).some(
          (f) => f.kind === "polyline" && f.closed === true,
        ),
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "drop-endpoint",
      anchor: "tools.select",
      title: "guideText.features.closePolygonGuide.steps.drop-endpoint.title",
      body: "guideText.features.closePolygonGuide.steps.drop-endpoint.body",
      navigate: goToEdit,
      missingHint: studioHint,
    },
  ],
};

export const drawRegionGuide: Guide = {
  id: "draw-region",
  title: "guideText.features.drawRegionGuide.title",
  description: "guideText.features.drawRegionGuide.description",
  keywords: "guideText.features.drawRegionGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "pick-tool",
      anchor: "tools.region",
      title: "guideText.features.drawRegionGuide.steps.pick-tool.title",
      body: "guideText.features.drawRegionGuide.steps.pick-tool.body",
      done: ({ editor }) => editor.activeTool === "region",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "outline",
      anchor: "pane.source",
      title: "guideText.features.drawRegionGuide.steps.outline.title",
      body: "guideText.features.drawRegionGuide.steps.outline.body",
      done: hasFeatureKind("region"),
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "feather",
      anchor: "selection.inspector",
      title: "guideText.features.drawRegionGuide.steps.feather.title",
      body: "guideText.features.drawRegionGuide.steps.feather.body",
      navigate: openSelectionSection,
      missingHint:
        "guideText.features.drawRegionGuide.steps.feather.missingHint",
    },
  ],
};

export const manageSelectionGuide: Guide = {
  id: "manage-selection",
  title: "guideText.features.manageSelectionGuide.title",
  description: "guideText.features.manageSelectionGuide.description",
  keywords: "guideText.features.manageSelectionGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "pick-tool",
      anchor: "tools.select",
      title: "guideText.features.manageSelectionGuide.steps.pick-tool.title",
      body: "guideText.features.manageSelectionGuide.steps.pick-tool.body",
      done: ({ editor }) => editor.activeTool === "select",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "select",
      anchor: "pane.source",
      title: "guideText.features.manageSelectionGuide.steps.select.title",
      body: "guideText.features.manageSelectionGuide.steps.select.body",
      done: ({ editor }) => editor.selection.length > 0,
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "inspector",
      anchor: "selection.inspector",
      title: "guideText.features.manageSelectionGuide.steps.inspector.title",
      body: "guideText.features.manageSelectionGuide.steps.inspector.body",
      navigate: openSelectionSection,
      missingHint:
        "guideText.features.manageSelectionGuide.steps.inspector.missingHint",
    },
    {
      id: "list",
      anchor: "features.list",
      title: "guideText.features.manageSelectionGuide.steps.list.title",
      body: "guideText.features.manageSelectionGuide.steps.list.body",
    },
  ],
};

export const pushPointsGuide: Guide = {
  id: "push-points",
  title: "guideText.features.pushPointsGuide.title",
  description: "guideText.features.pushPointsGuide.description",
  keywords: "guideText.features.pushPointsGuide.keywords",
  category: "features",
  ...needsProject,
  steps: [
    {
      id: "pick-tool",
      anchor: "tools.push",
      title: "guideText.features.pushPointsGuide.steps.pick-tool.title",
      body: "guideText.features.pushPointsGuide.steps.pick-tool.body",
      done: ({ editor }) => editor.activeTool === "push",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "sculpt",
      anchor: "pane.source",
      title: "guideText.features.pushPointsGuide.steps.sculpt.title",
      body: "guideText.features.pushPointsGuide.steps.sculpt.body",
      navigate: goToEdit,
      missingHint: studioHint,
    },
    {
      id: "undo",
      anchor: null,
      title: "guideText.features.pushPointsGuide.steps.undo.title",
      body: "guideText.features.pushPointsGuide.steps.undo.body",
    },
  ],
};

export const featureGuides: Guide[] = [
  placePointsGuide,
  drawLinesGuide,
  drawPolylineGuide,
  closePolygonGuide,
  drawRegionGuide,
  manageSelectionGuide,
  pushPointsGuide,
];
