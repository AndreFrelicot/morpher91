import { ModalBackdrop } from "@/ui/components/ModalBackdrop";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "radix-ui";
import { Check, Globe, LoaderCircle, X } from "lucide-react";
import { assist } from "@/assist/anchors";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import {
  AVAILABLE_LANGUAGES,
  changeAppLanguage,
  LANGUAGE_METADATA,
  type Language,
} from "@/i18n";
import { resolveLanguage } from "@/i18n/languages";
import { nativeFontFamily } from "@/i18n/fonts";
import { Button } from "./ui/button";
import { dialogStyles } from "./dialogStyles";

export function LanguageMenu() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Language | null>(null);
  const [failed, setFailed] = useState<Language | null>(null);
  const request = useRef(0);
  const current =
    resolveLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";
  const collator = new Intl.Collator(current, { sensitivity: "base" });
  const ordered = [...AVAILABLE_LANGUAGES].sort((a, b) => {
    if (a === current) return -1;
    if (b === current) return 1;
    return collator.compare(t(`language.names.${a}`), t(`language.names.${b}`));
  });

  async function choose(language: Language) {
    const id = ++request.current;
    setPending(language);
    setFailed(null);
    try {
      const applied = await changeAppLanguage(language);
      if (id !== request.current) return;
      if (applied) setOpen(false);
    } catch {
      if (id === request.current) setFailed(language);
    } finally {
      if (id === request.current) setPending(null);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2"
          aria-label={t("topbar.language")}
          title={t("topbar.language")}
          {...assist("topbar.language")}
        >
          <Globe aria-hidden />
          <span className="text-xs" dir="ltr">
            {LANGUAGE_METADATA[current].short}
          </span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <ModalBackdrop className="z-[80]" />
        <Dialog.Content
          className={cn(
            dialogStyles.position,
            dialogStyles.surface,
            "z-[81] flex max-h-[calc(100dvh-2rem)] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden",
          )}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className={dialogStyles.header}>
            <div>
              <Dialog.Title className={dialogStyles.title}>
                {t("language.title")}
              </Dialog.Title>
              <Dialog.Description className={dialogStyles.description}>
                {t("language.description")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("mobile.close")}
                className={dialogStyles.close}
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <div
            className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6"
            onFocusCapture={(event) => {
              // Radix wraps focus with preventScroll; reveal the focused card
              // inside this list without moving the fixed dialog header.
              const list = event.currentTarget;
              const bounds = list.getBoundingClientRect();
              const focused = event.target.getBoundingClientRect();
              const inset = 4; // Keep the focus ring inside the scroll viewport.
              if (focused.top < bounds.top + inset) {
                list.scrollTop += focused.top - bounds.top - inset;
              } else if (focused.bottom > bounds.bottom - inset) {
                list.scrollTop += focused.bottom - bounds.bottom + inset;
              }
            }}
          >
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              aria-busy={pending !== null}
            >
              {ordered.map((language) => {
                const meta = LANGUAGE_METADATA[language];
                const selected = language === current;
                return (
                  <button
                    key={language}
                    type="button"
                    lang={language}
                    aria-label={`${meta.short}: ${meta.nativeName} — ${t(`language.names.${language}`)}`}
                    aria-pressed={selected}
                    onClick={() => void choose(language)}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-xl border p-3 text-start transition-colors",
                      selected
                        ? "border-primary/50 bg-primary/10"
                        : "border-border hover:border-dialog-border hover:bg-accent/40",
                      FOCUS_RING,
                    )}
                  >
                    <span
                      dir="ltr"
                      className="shrink-0 rounded border border-border px-1.5 py-1 text-xs text-muted-foreground"
                    >
                      {meta.short}
                    </span>
                    <span
                      aria-hidden="true"
                      dir="ltr"
                      className="w-11 shrink-0 text-center text-lg leading-none"
                      style={{
                        fontFamily:
                          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
                      }}
                    >
                      {meta.flag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block break-words text-sm font-semibold"
                        dir={meta.direction}
                        style={{ fontFamily: nativeFontFamily(language) }}
                      >
                        {meta.nativeName}
                      </span>
                      <span
                        lang={current}
                        className="mt-0.5 block text-xs text-muted-foreground"
                      >
                        {t(`language.names.${language}`)}
                      </span>
                    </span>
                    {pending === language ? (
                      <LoaderCircle
                        className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : selected ? (
                      <Check
                        className="size-4 shrink-0 text-primary"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            {pending && (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                {t("language.loading", {
                  language: LANGUAGE_METADATA[pending].nativeName,
                })}
              </p>
            )}
            {failed && (
              <div className="mt-4 space-y-3">
                <p role="alert" className="text-sm text-destructive">
                  {t("language.loadError")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void choose(failed)}
                >
                  {t("language.retry")}
                </Button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
