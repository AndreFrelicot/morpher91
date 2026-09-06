import type { ProjectState } from "@/store/projectStore";

type PreviewMedia = Pick<
  ProjectState,
  "source" | "target" | "sourceVideo" | "targetVideo"
>;

/** Decoder inputs only: editing clip metadata must retain the frame caches. */
export function previewMediaIdentity(state: PreviewMedia): unknown[] {
  return [
    state.source?.bitmap,
    state.target?.bitmap,
    ...[state.sourceVideo, state.targetVideo].flatMap((video) => [
      video?.element,
      video?.objectUrl,
      video?.asset.width,
      video?.asset.height,
      video?.asset.durationSec,
    ]),
  ];
}

export function samePreviewMedia(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
