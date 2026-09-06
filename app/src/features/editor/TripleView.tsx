import { useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { FeaturePane } from "./FeaturePane";
import { MorphCanvas } from "./MorphCanvas";
import { StudioEmptyState } from "./StudioEmptyState";

export function TripleView() {
  const { t } = useTranslation();
  const source = useProjectStore((s) => s.source);
  const target = useProjectStore((s) => s.target);
  const chromeHidden = useEditorStore((s) => s.overlayChromeHidden);

  if (!source || !target) {
    return <StudioEmptyState />;
  }

  return (
    <div className="grid h-full w-full grid-cols-3 gap-px bg-border">
      <FeaturePane
        slot="source"
        label={t("assets.sourceA")}
        dotClassName="bg-image-a"
      />
      <div className="relative h-full w-full overflow-hidden bg-background">
        <MorphCanvas />
        {!chromeHidden && (
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {t("studio.morphPreview")}
          </div>
        )}
      </div>
      <FeaturePane
        slot="target"
        label={t("assets.targetB")}
        dotClassName="bg-image-b"
      />
    </div>
  );
}
