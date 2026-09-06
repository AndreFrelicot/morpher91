import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { useEditorStore } from "@/store/editorStore";
import { StudioView } from "@/features/editor/StudioView";
import { TopBar } from "@/ui/layout/TopBar";
import { ToolRail } from "@/ui/layout/ToolRail";
import { LeftSidebar } from "@/ui/layout/LeftSidebar";
import { RightInspector } from "@/ui/layout/RightInspector";
import { TimelineDock } from "@/ui/layout/TimelineDock";
import { AppDialog } from "@/ui/components/AppDialog";
import { DeviceLostBanner } from "@/ui/components/DeviceLostBanner";
import { AssistantOverlay } from "@/assist/AssistantOverlay";
import { AssistLauncher } from "@/assist/AssistLauncher";
import {
  DeferredDemoAssetsDialog,
  DeferredExportDialog,
  LazyComparePage,
} from "@/ui/layout/LazySurfaces";

function MainCanvas() {
  const { t } = useTranslation();
  const activeTab = useEditorStore((s) => s.activeTab);
  const panelProps = {
    id: `${activeTab}-panel`,
    role: "tabpanel",
    "aria-label": t("shell.panelAria", {
      tab: t(`topbar.tabs.${activeTab}`),
    }),
  } as const;

  if (activeTab === "compare") {
    return (
      <main
        {...panelProps}
        className="relative flex flex-1 overflow-hidden bg-background"
      >
        <LazyComparePage />
      </main>
    );
  }

  return (
    <main
      {...panelProps}
      className="relative flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,oklch(0.24_0.018_266),var(--background))]"
    >
      <StudioView />
    </main>
  );
}

/** Edge tab to reopen the collapsed right inspector without leaving the canvas. */
function InspectorReopenTab() {
  const { t } = useTranslation();
  const rightOpen = useEditorStore((s) => s.panelsOpen.right);
  const setPanelOpen = useEditorStore((s) => s.setPanelOpen);
  if (rightOpen) return null;

  return (
    <button
      type="button"
      title={t("shell.panels.right")}
      aria-label={t("shell.panels.right")}
      onClick={() => setPanelOpen("right", true)}
      className={cn(
        "absolute end-0 top-1/2 z-30 flex -translate-y-1/2 items-center rounded-s-md border border-e-0 border-border bg-card/90 px-1 py-3.5 text-muted-foreground backdrop-blur transition-colors hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <ChevronLeft className="size-3.5 rtl:rotate-180" />
    </button>
  );
}

export function AppShell() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <DeviceLostBanner />
      <AppDialog />
      <DeferredDemoAssetsDialog />
      <DeferredExportDialog />
      <AssistantOverlay />
      <AssistLauncher />
      <TopBar />
      <div className="relative flex flex-1 overflow-hidden">
        <ToolRail />
        <LeftSidebar />
        <MainCanvas />
        <RightInspector />
        <InspectorReopenTab />
      </div>
      <TimelineDock />
    </div>
  );
}
