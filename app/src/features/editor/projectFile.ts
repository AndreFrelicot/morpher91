import { hydrateProjectImages } from "@/lib/image/loadImage";
import {
  deserializeProject,
  ProjectFileError,
  serializeProject,
  type MorphProject,
} from "@/morph/model";
import { useProjectStore } from "@/store/projectStore";
import { prepareProjectReplacement } from "./projectSession";

const PROJECT_FILE_ERROR_KEYS = {
  "invalid-json": "topbar.loadErrors.invalidJson",
  "unsupported-version": "topbar.loadErrors.unsupportedVersion",
  "invalid-structure": "topbar.loadErrors.invalidStructure",
  "limit-exceeded": "topbar.loadErrors.limitExceeded",
  "invalid-reference": "topbar.loadErrors.invalidReference",
  "invalid-mask": "topbar.loadErrors.invalidMask",
} as const;

export function projectFileErrorKey(error: unknown) {
  return error instanceof ProjectFileError
    ? PROJECT_FILE_ERROR_KEYS[error.code]
    : "topbar.loadError";
}

/**
 * Save/load a project as a `.morph.json` download / upload (PRD §16). Extracted
 * so the desktop TopBar and the mobile shell share one implementation; both use
 * the anchor-download pattern (no File System Access API) which works on iOS.
 */
export function saveProjectFile(project: MorphProject): void {
  const name = project.name.trim().replace(/[^\w-]+/g, "-") || "project";
  const json = JSON.stringify(serializeProject(project), null, 2);
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.morph.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Loads a project file into the stores, resetting history/selection to Studio. */
export async function loadProjectFile(file: File): Promise<void> {
  const loaded = await hydrateProjectImages(
    deserializeProject(await file.text()),
  );
  prepareProjectReplacement();
  useProjectStore.getState().loadProject(loaded.project, {
    source: loaded.source,
    target: loaded.target,
  });
}
