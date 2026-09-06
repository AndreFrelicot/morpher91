import { ModalBackdrop } from "@/ui/components/ModalBackdrop";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { version } from "../../../package.json";
import { assist } from "@/assist/anchors";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { AppLogo } from "./AppLogo";
import { Button } from "./ui/button";

export function AboutDialog({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
          {...assist("topbar.about")}
        >
          {t("topbar.about")}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <ModalBackdrop className="z-[80]" />
        <Dialog.Content
          className={cn(
            dialogStyles.position,
            dialogStyles.surface,
            "z-[81] max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] touch-pan-y overflow-y-auto overscroll-contain p-6",
          )}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={t("about.close")}
              className={cn(
                dialogStyles.close,
                "absolute end-5 top-5 sm:end-6 sm:top-6",
              )}
            >
              <X className="size-5" aria-hidden />
            </button>
          </Dialog.Close>

          <div className="flex items-center gap-4 pe-10">
            <AppLogo className="size-16 rounded-xl sm:size-20" />
            <div>
              <p className={cn(dialogStyles.sectionTitle, "mb-1.5")}>
                {t("about.credits")}
              </p>
              <Dialog.Title className={dialogStyles.title}>
                Morpher<span className="text-primary">91</span>
              </Dialog.Title>
              <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                {t("about.version", { version })}
              </p>
            </div>
          </div>

          <Dialog.Description className={cn(dialogStyles.description, "mt-6")}>
            {t("about.description")}
          </Dialog.Description>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("about.author")}
          </p>
          <a
            href="https://andrefrelicot.dev"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mt-1 inline-block rounded-sm text-sm text-primary underline-offset-4 hover:underline",
              FOCUS_RING,
            )}
          >
            andrefrelicot.dev
          </a>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            <time dateTime="2026-09">{t("about.date")}</time>
          </p>

          <section className="mt-6 border-t border-border pt-5">
            <h2 className={dialogStyles.sectionTitle}>
              {t("about.privacyTitle")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("about.privacy")}
            </p>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
