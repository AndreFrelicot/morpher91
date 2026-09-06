import { useEffect } from "react";
import { Direction } from "radix-ui";
import { useTranslation } from "react-i18next";
import { languageDirection, resolveLanguage } from "@/i18n/languages";
import { DevFixtureLoader } from "@/dev/DevFixtureLoader";
import { disposeProjectSession } from "@/features/editor/projectSession";
import { useIsMobile } from "@/lib/useIsMobile";
import { installViewportScrollLock } from "@/lib/viewport/lockViewportScroll";
import { AppShell } from "@/ui/layout/AppShell";
import { DesktopOnlyGate } from "@/ui/layout/mobile/DesktopOnlyGate";
import { MobileShell } from "@/ui/layout/mobile/MobileShell";
import { LanguageRestoreNotice } from "@/ui/components/LanguageRestoreNotice";

export function App() {
  const isMobile = useIsMobile();
  const { i18n } = useTranslation();
  const direction = languageDirection(resolveLanguage(i18n.language) ?? "en");
  useEffect(() => {
    const unlockViewport = installViewportScrollLock();
    return () => {
      unlockViewport();
      disposeProjectSession();
    };
  }, []);
  return (
    <Direction.DirectionProvider dir={direction}>
      <LanguageRestoreNotice />
      {import.meta.env.DEV ? <DevFixtureLoader /> : null}
      {isMobile ? (
        <DesktopOnlyGate>
          <MobileShell />
        </DesktopOnlyGate>
      ) : (
        <AppShell />
      )}
    </Direction.DirectionProvider>
  );
}
