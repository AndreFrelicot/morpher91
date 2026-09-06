import { useEditorStore } from "@/store/editorStore";
import type { Guide } from "./types";

/** Safe navigation helpers shared by the "start" guides. */
function goToStudio(): void {
  const s = useEditorStore.getState();
  s.setTab("studio");
}

function openDemo(): void {
  useEditorStore.getState().setDemoDialogOpen(true);
}

function openAlgorithmSection(): void {
  const s = useEditorStore.getState();
  s.setTab("studio");
  s.setInspectorSectionOpen("algorithm", true);
}

export const loadImagesGuide: Guide = {
  id: "load-images",
  title: "guideText.start.loadImagesGuide.title",
  description: "guideText.start.loadImagesGuide.description",
  keywords: "guideText.start.loadImagesGuide.keywords",
  category: "start",
  steps: [
    {
      id: "demo",
      anchor: "topbar.demo",
      title: "guideText.start.loadImagesGuide.steps.demo.title",
      body: "guideText.start.loadImagesGuide.steps.demo.body",
      done: ({ project }) => project.project !== null,
      navigate: openDemo,
      missingHint: "guideText.start.loadImagesGuide.steps.demo.missingHint",
    },
    {
      id: "source",
      anchor: "assets.source",
      title: "guideText.start.loadImagesGuide.steps.source.title",
      body: "guideText.start.loadImagesGuide.steps.source.body",
      done: ({ project }) => project.source !== null,
      navigate: goToStudio,
      missingHint: "guideText.start.loadImagesGuide.steps.source.missingHint",
    },
    {
      id: "target",
      anchor: "assets.target",
      title: "guideText.start.loadImagesGuide.steps.target.title",
      body: "guideText.start.loadImagesGuide.steps.target.body",
      done: ({ project }) => project.target !== null,
      navigate: goToStudio,
      missingHint: "guideText.start.loadImagesGuide.steps.target.missingHint",
    },
  ],
};

export const chooseAlgorithmGuide: Guide = {
  id: "choose-algorithm",
  title: "guideText.start.chooseAlgorithmGuide.title",
  description: "guideText.start.chooseAlgorithmGuide.description",
  keywords: "guideText.start.chooseAlgorithmGuide.keywords",
  category: "start",
  precondition: ({ project }) => project.project !== null,
  preconditionHint: "guideText.start.chooseAlgorithmGuide.preconditionHint",
  steps: [
    {
      id: "algorithm-list",
      anchor: "algorithm.list",
      title: "guideText.start.chooseAlgorithmGuide.steps.algorithm-list.title",
      body: "guideText.start.chooseAlgorithmGuide.steps.algorithm-list.body",
      navigate: openAlgorithmSection,
      missingHint:
        "guideText.start.chooseAlgorithmGuide.steps.algorithm-list.missingHint",
    },
    {
      id: "pick-tps",
      anchor: "algorithm.list",
      title: "guideText.start.chooseAlgorithmGuide.steps.pick-tps.title",
      body: "guideText.start.chooseAlgorithmGuide.steps.pick-tps.body",
      done: ({ project }) => project.activeAlgorithm === "thin-plate-spline",
      navigate: openAlgorithmSection,
      missingHint:
        "guideText.start.chooseAlgorithmGuide.steps.pick-tps.missingHint",
    },
    {
      id: "settings",
      anchor: "algorithm.settings",
      title: "guideText.start.chooseAlgorithmGuide.steps.settings.title",
      body: "guideText.start.chooseAlgorithmGuide.steps.settings.body",
      navigate: goToStudio,
      missingHint:
        "guideText.start.chooseAlgorithmGuide.steps.settings.missingHint",
    },
  ],
};

export const navigateViewsGuide: Guide = {
  id: "navigate-views",
  title: "guideText.start.navigateViewsGuide.title",
  description: "guideText.start.navigateViewsGuide.description",
  keywords: "guideText.start.navigateViewsGuide.keywords",
  category: "start",
  precondition: ({ project }) => project.project !== null,
  preconditionHint: "guideText.start.navigateViewsGuide.preconditionHint",
  steps: [
    {
      id: "toggle",
      anchor: "view.toggle",
      title: "guideText.start.navigateViewsGuide.steps.toggle.title",
      body: "guideText.start.navigateViewsGuide.steps.toggle.body",
      navigate: goToStudio,
      missingHint:
        "guideText.start.navigateViewsGuide.steps.toggle.missingHint",
    },
    {
      id: "triple",
      anchor: "view.toggle",
      title: "guideText.start.navigateViewsGuide.steps.triple.title",
      body: "guideText.start.navigateViewsGuide.steps.triple.body",
      done: ({ editor }) => editor.studioView === "triple",
      navigate: goToStudio,
      missingHint:
        "guideText.start.navigateViewsGuide.steps.triple.missingHint",
    },
    {
      id: "zoom-pan",
      anchor: "pane.source",
      title: "guideText.start.navigateViewsGuide.steps.zoom-pan.title",
      body: "guideText.start.navigateViewsGuide.steps.zoom-pan.body",
      navigate: goToStudio,
      missingHint:
        "guideText.start.navigateViewsGuide.steps.zoom-pan.missingHint",
    },
  ],
};

export const saveLoadGuide: Guide = {
  id: "save-load",
  title: "guideText.start.saveLoadGuide.title",
  description: "guideText.start.saveLoadGuide.description",
  keywords: "guideText.start.saveLoadGuide.keywords",
  category: "start",
  precondition: ({ project }) => project.project !== null,
  preconditionHint: "guideText.start.saveLoadGuide.preconditionHint",
  steps: [
    {
      id: "save",
      anchor: "topbar.save",
      title: "guideText.start.saveLoadGuide.steps.save.title",
      body: "guideText.start.saveLoadGuide.steps.save.body",
    },
    {
      id: "load",
      anchor: "topbar.load",
      title: "guideText.start.saveLoadGuide.steps.load.title",
      body: "guideText.start.saveLoadGuide.steps.load.body",
    },
  ],
};

export const aboutGuide: Guide = {
  id: "about-install",
  title: "guideText.start.aboutGuide.title",
  description: "guideText.start.aboutGuide.description",
  keywords: "guideText.start.aboutGuide.keywords",
  category: "start",
  steps: [
    {
      id: "about",
      anchor: "topbar.about",
      title: "guideText.start.aboutGuide.steps.about.title",
      body: "guideText.start.aboutGuide.steps.about.body",
      missingHint: "guideText.start.aboutGuide.steps.about.missingHint",
    },
  ],
};

export const languageGuide: Guide = {
  id: "change-language",
  title: "guideText.start.languageGuide.title",
  description: "guideText.start.languageGuide.description",
  keywords: "guideText.start.languageGuide.keywords",
  category: "start",
  steps: [
    {
      id: "language",
      anchor: "topbar.language",
      title: "guideText.start.languageGuide.stepTitle",
      body: "guideText.start.languageGuide.body",
    },
  ],
};

export const startGuides: Guide[] = [
  loadImagesGuide,
  chooseAlgorithmGuide,
  navigateViewsGuide,
  saveLoadGuide,
  aboutGuide,
  languageGuide,
];
