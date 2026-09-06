import i18next from "i18next";
import {
  ACTION_SHORTCUT_LABELS,
  TOOL_SHORTCUT_LABELS,
} from "@/features/editor/useKeyboardShortcuts";
import type { EditorTool } from "@/store/editorStore";
import { useEditorStore } from "@/store/editorStore";
import type { AssistSnapshot, Guide, L } from "./types";

const needsProject: {
  precondition: (s: AssistSnapshot) => boolean;
  preconditionHint: L;
} = {
  precondition: ({ project }) => project.project !== null,
  preconditionHint: "guideText.output.needsProject.preconditionHint",
};

export const timelineGuide: Guide = {
  id: "timeline-basics",
  title: "guideText.output.timelineGuide.title",
  description: "guideText.output.timelineGuide.description",
  keywords: "guideText.output.timelineGuide.keywords",
  category: "timeline-video",
  ...needsProject,
  steps: [
    {
      id: "scrub",
      anchor: "timeline.ruler",
      title: "guideText.output.timelineGuide.steps.scrub.title",
      body: "guideText.output.timelineGuide.steps.scrub.body",
      done: ({ editor }) => editor.tauSec > 0,
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint: "guideText.output.timelineGuide.steps.scrub.missingHint",
    },
    {
      id: "transport",
      anchor: "timeline.play",
      title: "guideText.output.timelineGuide.steps.transport.title",
      body: "guideText.output.timelineGuide.steps.transport.body",
      done: ({ editor }) => editor.playing,
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint: "guideText.output.timelineGuide.steps.transport.missingHint",
    },
    {
      id: "clips",
      anchor: "timeline.tracks",
      title: "guideText.output.timelineGuide.steps.clips.title",
      body: "guideText.output.timelineGuide.steps.clips.body",
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint: "guideText.output.timelineGuide.steps.clips.missingHint",
    },
    {
      id: "still-image-timing",
      anchor: "timeline.tracks",
      title: "guideText.output.timelineGuide.steps.still-image-timing.title",
      body: "guideText.output.timelineGuide.steps.still-image-timing.body",
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint:
        "guideText.output.timelineGuide.steps.still-image-timing.missingHint",
    },
    {
      id: "zen",
      // Informative: the whole point of this step is that the panels are gone.
      anchor: null,
      title: "guideText.output.timelineGuide.steps.zen.title",
      body: (lng) =>
        i18next.t("guideText.output.timelineGuide.steps.zen.body", {
          lng,
          shortcut: ACTION_SHORTCUT_LABELS.zen,
        }),
      done: ({ editor }) => editor.zen,
    },
  ],
};

export const videosGuide: Guide = {
  id: "videos",
  title: "guideText.output.videosGuide.title",
  description: "guideText.output.videosGuide.description",
  keywords: "guideText.output.videosGuide.keywords",
  category: "timeline-video",
  steps: [
    {
      id: "get-videos",
      anchor: "topbar.demo",
      title: "guideText.output.videosGuide.steps.get-videos.title",
      body: "guideText.output.videosGuide.steps.get-videos.body",
      done: ({ project }) =>
        Boolean(
          project.project?.videos?.source || project.project?.videos?.target,
        ),
      navigate: () => useEditorStore.getState().setDemoDialogOpen(true),
      missingHint: "guideText.output.videosGuide.steps.get-videos.missingHint",
    },
    {
      id: "place-clips",
      anchor: "timeline.tracks",
      title: "guideText.output.videosGuide.steps.place-clips.title",
      body: "guideText.output.videosGuide.steps.place-clips.body",
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint: "guideText.output.videosGuide.steps.place-clips.missingHint",
    },
    {
      id: "keyframes",
      anchor: "selection.inspector",
      title: "guideText.output.videosGuide.steps.keyframes.title",
      body: "guideText.output.videosGuide.steps.keyframes.body",
      navigate: () => {
        const s = useEditorStore.getState();
        s.setTab("studio");
        s.setInspectorSectionOpen("selection", true);
      },
      missingHint: "guideText.output.videosGuide.steps.keyframes.missingHint",
    },
    {
      id: "timeline-keyframes",
      anchor: "timeline.tracks",
      title: "guideText.output.videosGuide.steps.timeline-keyframes.title",
      body: "guideText.output.videosGuide.steps.timeline-keyframes.body",
      navigate: () => useEditorStore.getState().setTab("studio"),
      missingHint:
        "guideText.output.videosGuide.steps.timeline-keyframes.missingHint",
    },
  ],
};

export const compareGuide: Guide = {
  id: "compare-algorithms",
  title: "guideText.output.compareGuide.title",
  description: "guideText.output.compareGuide.description",
  keywords: "guideText.output.compareGuide.keywords",
  category: "output",
  ...needsProject,
  steps: [
    {
      id: "open",
      anchor: "topbar.tab.compare",
      title: "guideText.output.compareGuide.steps.open.title",
      body: "guideText.output.compareGuide.steps.open.body",
      done: ({ editor }) => editor.activeTab === "compare",
    },
    {
      id: "read",
      anchor: null,
      title: "guideText.output.compareGuide.steps.read.title",
      body: "guideText.output.compareGuide.steps.read.body",
    },
  ],
};

export const exportGuide: Guide = {
  id: "export-video",
  title: "guideText.output.exportGuide.title",
  description: "guideText.output.exportGuide.description",
  keywords: "guideText.output.exportGuide.keywords",
  category: "output",
  ...needsProject,
  steps: [
    {
      id: "open",
      anchor: "topbar.export",
      title: "guideText.output.exportGuide.steps.open.title",
      body: "guideText.output.exportGuide.steps.open.body",
      done: ({ editor }) => editor.exportDialogOpen,
    },
    {
      id: "settings",
      anchor: "export.panel",
      title: "guideText.output.exportGuide.steps.settings.title",
      body: "guideText.output.exportGuide.steps.settings.body",
      done: ({ editor }) => editor.exportDialogOpen,
    },
    {
      id: "run",
      anchor: "export.button",
      title: "guideText.output.exportGuide.steps.run.title",
      body: "guideText.output.exportGuide.steps.run.body",
    },
  ],
};

type ShortcutLabelKey =
  | `tools.${EditorTool}`
  | `assist.shortcuts.${"undo" | "redo" | "delete" | "stepFrame" | "jumpEnds" | "zen" | "hideChrome"}`;

/** Composed from the real shortcut tables so it can never drift from the app. */
function shortcutList(lng: string): string {
  const label = (key: ShortcutLabelKey) => i18next.t(key, { lng });
  const tools = (Object.keys(TOOL_SHORTCUT_LABELS) as EditorTool[]).map(
    (tool) => `${TOOL_SHORTCUT_LABELS[tool]} — ${label(`tools.${tool}`)}`,
  );
  const actions = [
    `${ACTION_SHORTCUT_LABELS.undo} — ${label("assist.shortcuts.undo")}`,
    `${ACTION_SHORTCUT_LABELS.redo} — ${label("assist.shortcuts.redo")}`,
    `${ACTION_SHORTCUT_LABELS.deleteSelection} — ${label("assist.shortcuts.delete")}`,
    `${ACTION_SHORTCUT_LABELS.timelineStepBack}/${ACTION_SHORTCUT_LABELS.timelineStepForward} — ${label("assist.shortcuts.stepFrame")}`,
    `${ACTION_SHORTCUT_LABELS.timelineStart}/${ACTION_SHORTCUT_LABELS.timelineEnd} — ${label("assist.shortcuts.jumpEnds")}`,
    `${ACTION_SHORTCUT_LABELS.zen} — ${label("assist.shortcuts.zen")}`,
    `${ACTION_SHORTCUT_LABELS.overlayChrome} — ${label("assist.shortcuts.hideChrome")}`,
  ];
  return [...tools, ...actions].join("\n");
}

export const shortcutsGuide: Guide = {
  id: "keyboard-shortcuts",
  title: "guideText.output.shortcutsGuide.title",
  description: "guideText.output.shortcutsGuide.description",
  keywords: "guideText.output.shortcutsGuide.keywords",
  category: "output",
  steps: [
    {
      id: "list",
      anchor: null,
      title: "guideText.output.shortcutsGuide.steps.list.title",
      body: shortcutList,
    },
  ],
};

export const outputGuides: Guide[] = [
  timelineGuide,
  videosGuide,
  compareGuide,
  exportGuide,
  shortcutsGuide,
];
