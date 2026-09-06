import {
  disposeBrushEngine,
  resetBrushEngine,
} from "@/morph/paint/brushPaintHost";
import { disposePreviewEngine } from "@/morph/playback/previewEngineHost";
import { useEditorStore } from "@/store/editorStore";
import { useHistoryStore } from "@/store/historyStore";
import {
  disposeProjectStoreMedia,
  useProjectStore,
} from "@/store/projectStore";

/** Restores every project-derived store and releases all runtime resources. */
export function resetProjectSession(): void {
  useEditorStore.getState().resetEditor();
  useHistoryStore.getState().resetHistory();
  resetBrushEngine();
  disposePreviewEngine();
  useProjectStore.getState().resetProject();
}

/** Clears transient state before atomically replacing the current document. */
export function prepareProjectReplacement(): void {
  useEditorStore.getState().resetEditor();
  useHistoryStore.getState().resetHistory();
  resetBrushEngine();
  disposePreviewEngine();
}

/** Final application teardown; no store mutation is needed during unmount. */
export function disposeProjectSession(): void {
  disposeBrushEngine();
  disposePreviewEngine();
  disposeProjectStoreMedia();
}
