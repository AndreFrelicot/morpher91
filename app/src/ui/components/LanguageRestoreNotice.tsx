import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { changeAppLanguage, languageStartup } from "@/i18n";
import { Button } from "./ui/button";
import { dialogStyles } from "./dialogStyles";

/** Visible English fallback when a saved catalogue or font could not be restored. */
export function LanguageRestoreNotice() {
  const { t, i18n } = useTranslation();
  const [failed, setFailed] = useState(languageStartup.failed);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const changed = () => {
      languageStartup.failed = null;
      setFailed(null);
    };
    i18n.on("languageChanged", changed);
    return () => {
      i18n.off("languageChanged", changed);
    };
  }, [i18n]);
  if (!failed) return null;

  async function retry() {
    if (!failed) return;
    setLoading(true);
    try {
      await changeAppLanguage(failed);
    } catch {
      // Keep the explanation and retry available; retain the usable interface.
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside
      className="fixed bottom-4 start-4 z-[90] max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-dialog-border bg-background p-4 shadow-xl"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <p role="status" className="min-w-0 flex-1 text-sm text-foreground">
          {loading
            ? t("language.loading", { language: t(`language.names.${failed}`) })
            : t("language.restoreError", {
                language: t(`language.names.${failed}`),
              })}
        </p>
        <button
          type="button"
          aria-label={t("mobile.close")}
          className={dialogStyles.close}
          onClick={() => {
            languageStartup.failed = null;
            setFailed(null);
          }}
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => void retry()}
      >
        {t("language.retry")}
      </Button>
    </aside>
  );
}
