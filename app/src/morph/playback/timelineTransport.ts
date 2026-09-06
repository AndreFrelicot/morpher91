import { timelineDurationSec } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { hasMissingProjectVideos, useProjectStore } from "@/store/projectStore";

export function seekTimeline(timeSec: number): void {
  const durationSec = timelineDurationSec(useProjectStore.getState().project);
  useEditorStore.getState().setTimelineTime(timeSec, durationSec);
}

export function toggleTimelinePlayback(): boolean {
  const projectState = useProjectStore.getState();
  if (hasMissingProjectVideos(projectState)) return false;
  const durationSec = timelineDurationSec(projectState.project);
  const editor = useEditorStore.getState();
  if (!editor.playing && editor.tauSec >= durationSec) {
    editor.setTimelineTime(0, durationSec);
  }
  editor.setPlaying(!editor.playing);
  return true;
}

export function stepTimelineFrame(
  direction: -1 | 1,
  skipToBoundary = false,
): void {
  const project = useProjectStore.getState().project;
  const durationSec = timelineDurationSec(project);
  const editor = useEditorStore.getState();
  const next = skipToBoundary
    ? direction < 0
      ? 0
      : durationSec
    : editor.tauSec + direction / (project?.timeline.fps ?? 30);
  editor.setTimelineTime(next, durationSec);
}
