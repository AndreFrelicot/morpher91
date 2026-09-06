import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function WebGPUNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex h-full w-full items-center justify-center bg-background p-6",
        className,
      )}
    >
      <p className="max-w-md whitespace-pre-line text-center text-sm leading-6 text-muted-foreground">
        {t("notices.noWebgpu")}
      </p>
    </div>
  );
}
