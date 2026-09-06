import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function TooManyFeaturesNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200 shadow-lg backdrop-blur",
        className,
      )}
    >
      <p className="whitespace-pre-line">{t("notices.tooManyFeatures")}</p>
    </div>
  );
}
