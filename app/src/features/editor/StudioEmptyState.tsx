import { Trans, useTranslation } from "react-i18next";
import { useEditorStore } from "@/store/editorStore";

/** Shared import prompt and demo entry point for Edit, Preview and Triple. */
export function StudioEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        <Trans
          i18nKey="studio.importPromptEdit"
          components={{
            a: <span className="text-image-a" />,
            b: <span className="text-image-b" />,
          }}
        />
      </p>
      <button
        type="button"
        onClick={() => useEditorStore.getState().setDemoDialogOpen(true)}
        className="rounded-md border-2 border-dialog-border px-4 py-2 text-sm font-medium text-foreground transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring dark:border-primary/60"
      >
        {t("demo.cta")}
      </button>
    </div>
  );
}
