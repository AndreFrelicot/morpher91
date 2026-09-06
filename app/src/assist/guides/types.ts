import type { AnchorId } from "../anchors";
import type { EditorState } from "@/store/editorStore";
import type { ProjectState } from "@/store/projectStore";
import type en from "@/i18n/locales/en.json";

type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`;
}[keyof T & string];

/** Resource references keep prose out of the guide's behavior definitions. */
export type L = `guideText.${LeafPaths<typeof en.guideText>}`;

/** Store snapshot handed to `done`/`precondition` predicates. */
export type AssistSnapshot = { editor: EditorState; project: ProjectState };

export type Step = {
  id: string;
  /** Element to highlight; null = informative step (centered popover). */
  anchor: AnchorId | null;
  title: L;
  body: L | ((language: string) => string);
  /** Completion feedback predicate, evaluated on store changes; never advances a step. */
  done?: (s: AssistSnapshot) => boolean;
  /**
   * Safe navigation for the "Show me" button — view/tab/tool/section changes
   * only, NEVER a project mutation.
   */
  navigate?: () => void;
  /** Shown when the anchor is not in the DOM (wrong view / closed panel). */
  missingHint?: L;
};

export type GuideCategory =
  | "start"
  | "features"
  | "layers-masks"
  | "timeline-video"
  | "output";

export type Guide = {
  id: string;
  title: L;
  description: L;
  /** Localized search keywords (space-separated). */
  keywords: L;
  category: GuideCategory;
  precondition?: (s: AssistSnapshot) => boolean;
  preconditionHint?: L;
  steps: Step[];
};
