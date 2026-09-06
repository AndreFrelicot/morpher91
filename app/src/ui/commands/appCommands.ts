import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { assist, type AnchorId } from "@/assist/anchors";
import { useAssistStore } from "@/assist/assistStore";
import {
  loadProjectFile,
  projectFileErrorKey,
  saveProjectFile,
} from "@/features/editor/projectFile";
import { resetProjectSession } from "@/features/editor/projectSession";
import { useDialogStore } from "@/store/dialogStore";
import { useEditorStore, type AppTab } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";

export type AppTabDefinition = {
  id: AppTab;
  labelKey: `topbar.tabs.${AppTab}`;
  assistAnchor: AnchorId | null;
};

/** Shared navigation contract; desktop and mobile differ only in presentation. */
export const APP_TABS: readonly AppTabDefinition[] = [
  {
    id: "studio",
    labelKey: "topbar.tabs.studio",
    assistAnchor: assist("topbar.tab.studio")["data-assist"],
  },
  {
    id: "compare",
    labelKey: "topbar.tabs.compare",
    assistAnchor: assist("topbar.tab.compare")["data-assist"],
  },
];

export function useAppCommands(
  loadInputRef: RefObject<HTMLInputElement | null>,
  onCommandHandled?: () => void,
) {
  const { t } = useTranslation();
  const hasProject = useProjectStore((state) => state.project !== null);

  const newProject = async (): Promise<boolean> => {
    if (hasProject) {
      const confirmed = await useDialogStore.getState().confirm({
        title: t("topbar.newConfirmTitle"),
        message: t("topbar.newConfirm"),
        actionLabel: t("topbar.newConfirmAction"),
        destructive: true,
      });
      if (!confirmed) return false;
    }
    resetProjectSession();
    onCommandHandled?.();
    return true;
  };

  const openDemo = (): void => {
    useEditorStore.getState().setDemoDialogOpen(true);
    onCommandHandled?.();
  };

  const openExport = (): void => {
    useEditorStore.getState().setExportDialogOpen(true);
    onCommandHandled?.();
  };

  const requestLoad = (): void => {
    loadInputRef.current?.click();
    onCommandHandled?.();
  };

  const loadFile = async (file: File): Promise<boolean> => {
    try {
      await loadProjectFile(file);
      return true;
    } catch (error) {
      await useDialogStore.getState().alert({
        title: t("topbar.loadErrorTitle"),
        message: t(projectFileErrorKey(error)),
      });
      return false;
    }
  };

  const saveProject = async (): Promise<boolean> => {
    const project = useProjectStore.getState().project;
    if (!project) return false;
    if (project.videos?.source || project.videos?.target) {
      const confirmed = await useDialogStore.getState().confirm({
        title: t("topbar.videoSaveTitle"),
        message: t("topbar.videoSaveNote"),
        actionLabel: t("topbar.videoSaveAction"),
      });
      if (!confirmed) return false;
    }
    saveProjectFile(project);
    onCommandHandled?.();
    return true;
  };

  const openHelp = (): void => {
    useAssistStore.getState().setLauncherOpen(true);
    onCommandHandled?.();
  };

  return {
    hasProject,
    newProject,
    openDemo,
    openExport,
    requestLoad,
    loadFile,
    saveProject,
    openHelp,
  };
}
