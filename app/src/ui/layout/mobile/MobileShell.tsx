import { useEffect, useState } from "react";
import { startPreviewDriver } from "@/morph/playback/previewDriver";
import { useEditorStore } from "@/store/editorStore";
import { MobileViewSwitcher } from "@/features/editor/mobile/MobileViewSwitcher";
import { useKeyboardShortcuts } from "@/features/editor/useKeyboardShortcuts";
import { MobileTopBar } from "./MobileTopBar";
import { MobileToolbar } from "./MobileToolbar";
import { MobileTimeline } from "./MobileTimeline";
import { MobileSheet } from "./MobileSheet";
import { AppDialog } from "@/ui/components/AppDialog";
import { DeviceLostBanner } from "@/ui/components/DeviceLostBanner";
import { AssistantOverlay } from "@/assist/AssistantOverlay";
import { AssistLauncher } from "@/assist/AssistLauncher";
import { useTranslation } from "react-i18next";
import {
  DeferredDemoAssetsDialog,
  DeferredExportDialog,
} from "@/ui/layout/LazySurfaces";

/**
 * Phone-portrait shell (PRD M12 lot 2). Reuses the same feature components as the
 * desktop AppShell but stacks them for a narrow, touch-first, one-live-view
 * layout: compact top bar, a single view (via the view switcher), a compact
 * transport, a horizontal tool strip, and the side rails folded into a sheet.
 */
export function MobileShell() {
  const { t } = useTranslation();
  const activeTab = useEditorStore((s) => s.activeTab);
  const [sheetOpen, setSheetOpen] = useState(false);
  useKeyboardShortcuts();

  // Ensure the shared playback clock runs even when no MorphCanvas is the live
  // view (e.g. editing Source A). Idempotent.
  useEffect(() => {
    startPreviewDriver();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <DeviceLostBanner />
      <AppDialog />
      <DeferredDemoAssetsDialog />
      <DeferredExportDialog />
      <AssistantOverlay />
      <AssistLauncher />
      <MobileTopBar onOpenInspector={() => setSheetOpen(true)} />
      <main
        id={`${activeTab}-panel`}
        role="tabpanel"
        aria-label={t("shell.panelAria", {
          tab: t(`topbar.tabs.${activeTab}`),
        })}
        className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,oklch(0.24_0.018_266),var(--background))]"
      >
        <MobileViewSwitcher key={activeTab} tab={activeTab} />
      </main>
      <MobileTimeline />
      {activeTab === "studio" && <MobileToolbar />}
      <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
