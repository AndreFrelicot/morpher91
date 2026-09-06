import type { Guide } from "./types";
import { startGuides } from "./start";
import { featureGuides } from "./features";
import { layerGuides } from "./layers";
import { outputGuides } from "./output";

export type { Guide, GuideCategory, L, Step } from "./types";

/** All guides, grouped in catalog order. */
export const GUIDES: Guide[] = [
  ...startGuides,
  ...featureGuides,
  ...layerGuides,
  ...outputGuides,
];

export function getGuide(id: string): Guide | null {
  return GUIDES.find((g) => g.id === id) ?? null;
}
