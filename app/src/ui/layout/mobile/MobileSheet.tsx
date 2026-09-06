import { dialogStyles } from "@/ui/components/dialogStyles";
import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AssetUploader } from "@/features/editor/AssetUploader";
import { FeatureList } from "@/features/editor/FeatureList";
import { RightInspector } from "@/ui/layout/RightInspector";

/**
 * Bottom sheet holding everything the desktop keeps in the side rails — assets,
 * the algorithm/property inspector, features and layers (PRD M12 lot 2). The
 * desktop RightInspector is reused in its `embedded` variant, which drops the
 * desktop collapse chrome and lets the sheet control the box.
 */
export function MobileSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t("mobile.inspector")}
    >
      <button
        type="button"
        aria-label={t("mobile.closeInspector")}
        className={cn(dialogStyles.overlay, "absolute cursor-default")}
        onClick={onClose}
      />
      <div
        className={cn(
          dialogStyles.surface,
          "relative flex max-h-[82dvh] flex-col overflow-hidden rounded-b-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <div className={dialogStyles.header}>
          <h2 className={dialogStyles.title}>{t("mobile.inspector")}</h2>
          <button
            type="button"
            aria-label={t("mobile.close")}
            onClick={onClose}
            className={dialogStyles.close}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title={t("sidebar.assets")}>
            <div className="space-y-2">
              <AssetUploader slot="source" dotClassName="bg-image-a" />
              <AssetUploader slot="target" dotClassName="bg-image-b" />
            </div>
          </Section>
          {/* Reuse the desktop inspector (M14: it now owns Algorithm, Layers
              and Selection) without its desktop collapse chrome. */}
          <RightInspector embedded />
          <Section title={t("sidebar.features")}>
            <FeatureList />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-3">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
