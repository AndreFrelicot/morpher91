import { create } from "zustand";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { getGuide } from "./guides";
import type { AssistSnapshot } from "./guides/types";

type AssistState = {
  launcherOpen: boolean;
  activeGuideId: string | null;
  stepIndex: number;
  /** Completion feedback only; navigation always requires an explicit action. */
  stepSatisfied: boolean;
  setLauncherOpen: (open: boolean) => void;
  startGuide: (id: string) => void;
  next: () => void;
  back: () => void;
  quit: () => void;
};

export const useAssistStore = create<AssistState>((set, get) => ({
  launcherOpen: false,
  activeGuideId: null,
  stepIndex: 0,
  stepSatisfied: false,
  setLauncherOpen: (launcherOpen) => set({ launcherOpen }),
  startGuide: (id) => {
    if (!getGuide(id)) return;
    set({
      activeGuideId: id,
      stepIndex: 0,
      stepSatisfied: false,
      launcherOpen: false,
    });
    evaluateStep();
  },
  next: () => {
    const { activeGuideId, stepIndex } = get();
    const guide = activeGuideId ? getGuide(activeGuideId) : null;
    if (!guide) return;
    if (stepIndex + 1 >= guide.steps.length) {
      set({ activeGuideId: null, stepIndex: 0, stepSatisfied: false });
      return;
    }
    set({ stepIndex: stepIndex + 1, stepSatisfied: false });
  },
  back: () => {
    const { stepIndex } = get();
    if (stepIndex > 0) set({ stepIndex: stepIndex - 1, stepSatisfied: false });
  },
  quit: () => set({ activeGuideId: null, stepIndex: 0, stepSatisfied: false }),
}));

function snapshot(): AssistSnapshot {
  return {
    editor: useEditorStore.getState(),
    project: useProjectStore.getState(),
  };
}

let engineStarted = false;
/** Reflect the current condition without changing the selected step. */
function evaluateStep(): void {
  const { activeGuideId, stepIndex, stepSatisfied } = useAssistStore.getState();
  const guide = activeGuideId ? getGuide(activeGuideId) : null;
  const step = guide?.steps[stepIndex];
  const satisfied = step?.done?.(snapshot()) ?? false;
  if (satisfied !== stepSatisfied) {
    useAssistStore.setState({ stepSatisfied: satisfied });
  }
}

/**
 * Subscribes the completion evaluator to the app stores. Idempotent; called
 * once from the AssistantOverlay mount.
 */
export function startAssistEngine(): void {
  if (engineStarted) return;
  engineStarted = true;
  useEditorStore.subscribe(evaluateStep);
  useProjectStore.subscribe(evaluateStep);
  useAssistStore.subscribe((s, prev) => {
    if (
      s.activeGuideId !== prev.activeGuideId ||
      s.stepIndex !== prev.stepIndex
    ) {
      evaluateStep();
    }
  });
  evaluateStep();
}
