import { useEffect } from "react";
import type { EditorTool } from "@/store/editorStore";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import { useProjectStore } from "@/store/projectStore";
import { timelineDurationSec } from "@/morph/model";

export const isTextTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "BUTTON" ||
    el.tagName === "INPUT" ||
    el.tagName === "SELECT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable);

type ShortcutInput = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  target?: EventTarget | null;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

export type KeyboardShortcutAction =
  | { type: "delete-selection" }
  | { type: "redo" }
  | { type: "set-t"; value: number }
  | { type: "set-tool"; tool: EditorTool }
  | { type: "shift-frame"; delta: number }
  | { type: "toggle-zen" }
  | { type: "toggle-overlay-chrome" }
  | { type: "undo" };

const TOOL_SHORTCUTS: Record<string, EditorTool> = {
  b: "brush",
  h: "pan",
  k: "push",
  l: "line",
  p: "point",
  v: "select",
  y: "polyline",
};

export const TOOL_SHORTCUT_LABELS: Partial<Record<EditorTool, string>> = {
  select: "V",
  point: "P",
  line: "L",
  polyline: "Y",
  brush: "B",
  push: "K",
  pan: "H",
};

export const TOOL_ARIA_SHORTCUTS: Partial<Record<EditorTool, string>> = {
  select: "V",
  point: "P",
  line: "L",
  polyline: "Y",
  brush: "B",
  push: "K",
  pan: "H",
};

export const ACTION_SHORTCUT_LABELS = {
  deleteSelection: "Delete/Backspace",
  redo: "Cmd/Ctrl+Shift+Z",
  timelineEnd: "End",
  timelineStepBack: "←",
  timelineStepForward: "→",
  timelineStart: "Home",
  undo: "Cmd/Ctrl+Z",
  zen: "Tab",
  overlayChrome: "U",
} as const;

export const ACTION_ARIA_SHORTCUTS = {
  deleteSelection: "Delete Backspace",
  timelineEnd: "End",
  timelinePosition: "ArrowLeft ArrowRight Home End",
  timelineStepBack: "ArrowLeft",
  timelineStepForward: "ArrowRight",
  timelineStart: "Home",
} as const;

export function tooltipWithShortcut(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcut})` : label;
}

export function resolveKeyboardShortcut(
  input: ShortcutInput,
): KeyboardShortcutAction | null {
  // Some browsers report IME composition only through the legacy 229 key code.
  if (
    input.isComposing ||
    input.keyCode === 229 ||
    isTextTarget(input.target ?? null)
  )
    return null;

  const key = input.key.toLowerCase();
  const meta = input.metaKey || input.ctrlKey;
  if (meta) {
    if (key === "z") {
      return input.shiftKey ? { type: "redo" } : { type: "undo" };
    }
    return null;
  }

  if (input.altKey) return null;

  if (input.key === "Backspace" || input.key === "Delete") {
    return { type: "delete-selection" };
  }
  if (input.key === "ArrowLeft") {
    return { type: "shift-frame", delta: -1 };
  }
  if (input.key === "ArrowRight") {
    return { type: "shift-frame", delta: 1 };
  }
  if (input.key === "Home") return { type: "set-t", value: 0 };
  if (input.key === "End") return { type: "set-t", value: 1 };
  // Plain Tab toggles zen mode (Shift+Tab keeps reverse focus navigation).
  if (input.key === "Tab" && !input.shiftKey) return { type: "toggle-zen" };
  if (key === "u") return { type: "toggle-overlay-chrome" };

  const tool = TOOL_SHORTCUTS[key];
  return tool ? { type: "set-tool", tool } : null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function applyShortcut(action: KeyboardShortcutAction): boolean {
  switch (action.type) {
    case "undo":
      useHistoryStore.getState().undo();
      return true;
    case "redo":
      useHistoryStore.getState().redo();
      return true;
    case "delete-selection": {
      const { selection, clearSelection } = useEditorStore.getState();
      if (selection.length === 0) return false;
      const history = useHistoryStore.getState();
      const project = useProjectStore.getState();
      history.begin();
      selection.forEach((id) => project.removeFeature(id));
      history.commit();
      clearSelection();
      return true;
    }
    case "set-tool":
      useEditorStore.getState().setTool(action.tool);
      return true;
    case "toggle-zen": {
      const { zen, setZen } = useEditorStore.getState();
      setZen(!zen);
      return true;
    }
    case "toggle-overlay-chrome": {
      const { overlayChromeHidden, setOverlayChromeHidden } =
        useEditorStore.getState();
      setOverlayChromeHidden(!overlayChromeHidden);
      return true;
    }
    case "shift-frame": {
      const project = useProjectStore.getState().project;
      const durationSec = timelineDurationSec(project);
      const { tauSec, setTimelineTime } = useEditorStore.getState();
      setTimelineTime(
        tauSec + action.delta * (1 / (project?.timeline.fps ?? 30)),
        durationSec,
      );
      return true;
    }
    case "set-t": {
      const durationSec = timelineDurationSec(
        useProjectStore.getState().project,
      );
      useEditorStore
        .getState()
        .setTimelineTime(clamp01(action.value) * durationSec, durationSec);
      return true;
    }
  }
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = resolveKeyboardShortcut(e);
      if (!action) return;
      if (applyShortcut(action)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
