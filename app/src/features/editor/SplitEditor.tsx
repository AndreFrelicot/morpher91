import { useTranslation } from "react-i18next";
import { useProjectStore } from "@/store/projectStore";
import { FeaturePane } from "./FeaturePane";
import { StudioEmptyState } from "./StudioEmptyState";

/**
 * Split A | B editing surface (PRD §14.3 "source-target-split"): source on the
 * left, target on the right, each with its own image and feature overlay.
 * Features carry distinct a/b positions, so they are edited per side.
 */
export function SplitEditor() {
  const { t } = useTranslation();
  const source = useProjectStore((s) => s.source);
  const target = useProjectStore((s) => s.target);

  if (!source || !target) {
    return <StudioEmptyState />;
  }

  return (
    <div className="grid h-full w-full grid-cols-2 gap-px bg-border">
      <FeaturePane
        slot="source"
        label={t("assets.sourceA")}
        dotClassName="bg-image-a"
      />
      <FeaturePane
        slot="target"
        label={t("assets.targetB")}
        dotClassName="bg-image-b"
      />
    </div>
  );
}
