import i18next from "i18next";
import type { FeaturePair } from "@/morph/model";

/**
 * Display name for a feature: its label, or a localized kind + position
 * fallback. Callers are React components that re-render on language change
 * (they subscribe via useTranslation for their own strings).
 */
export function featureName(f: FeaturePair, index: number): string {
  return f.label ?? `${i18next.t(`features.kinds.${f.kind}`)} ${index + 1}`;
}
