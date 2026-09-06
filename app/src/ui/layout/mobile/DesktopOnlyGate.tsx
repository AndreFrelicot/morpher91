import { useState, type ReactNode } from "react";
import { Check, Link, MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/ui/button";
import { FOCUS_RING } from "@/ui/focusRing";

/** Session flag: the visitor chose to enter the unsupported mobile shell. */
export const DESKTOP_GATE_STORAGE_KEY = "morpher91.mobileGateDismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DESKTOP_GATE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    sessionStorage.setItem(DESKTOP_GATE_STORAGE_KEY, "1");
  } catch {
    // Private mode / storage disabled: the gate simply shows again next load.
  }
}

/**
 * Full-screen notice shown to smartphone visitors: the studio is a desktop
 * experience and mobile use is not supported. "Continue anyway" reveals the
 * children (the mobile shell) for the rest of the session; the choice is not
 * remembered across visits. Tablets never see it (see `useIsMobile`).
 */
export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [copied, setCopied] = useState(false);

  if (dismissed) return <>{children}</>;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-gate-title"
      className="flex h-full flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground"
    >
      <MonitorSmartphone
        className="size-12 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="max-w-sm space-y-3">
        <h1 id="desktop-gate-title" className="text-xl font-semibold">
          {t("desktopGate.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("desktopGate.body")}</p>
        <p className="text-sm font-medium text-amber-500">
          {t("desktopGate.unsupported")}
        </p>
      </div>
      <Button type="button" onClick={copyLink} className="min-w-44">
        {copied ? <Check /> : <Link />}
        {copied ? t("desktopGate.copied") : t("desktopGate.copyLink")}
      </Button>
      <button
        type="button"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
        className={`rounded text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground ${FOCUS_RING}`}
      >
        {t("desktopGate.continueAnyway")}
      </button>
    </main>
  );
}
