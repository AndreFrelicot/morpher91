import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { AssetUploader } from "@/features/editor/AssetUploader";
import { BrushControls } from "@/features/editor/BrushControls";
import { FeatureList } from "@/features/editor/FeatureList";

function Section({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-3 py-3">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function LeftSidebar() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const open = useEditorStore((s) => s.panelsOpen.left);

  return (
    <aside
      inert={!open}
      className={cn(
        "overflow-hidden bg-card transition-[width,border-color] duration-300 ease-out motion-reduce:transition-none",
        open ? "w-60 border-e border-border" : "w-0 border-e-0",
      )}
    >
      <div className="flex h-full w-60 flex-col">
        {activeTool === "brush" && (
          <Section title={t("tools.brush")}>
            <BrushControls />
          </Section>
        )}

        <Section title={t("sidebar.assets")}>
          <div className="space-y-1.5">
            <AssetUploader slot="source" dotClassName="bg-image-a" />
            <AssetUploader slot="target" dotClassName="bg-image-b" />
          </div>
        </Section>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
          <Section title={t("sidebar.features")}>
            <div {...assist("features.list")}>
              <FeatureList />
            </div>
          </Section>
        </div>
      </div>
    </aside>
  );
}
