import { useRef, useState } from "react";
import { Eye, EyeOff, Maximize } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/components/ui/button";
import { LanguageMenu } from "@/ui/components/LanguageMenu";
import { AboutDialog } from "@/ui/components/AboutDialog";
import { AppLogo } from "@/ui/components/AppLogo";
import { TechBadge } from "@/ui/components/TechBadge";
import {
  isWebGPUSupported,
  isWebCodecsSupported,
} from "@/lib/gpu/capabilities";
import { assist } from "@/assist/anchors";
import { useEditorStore } from "@/store/editorStore";
import { APP_TABS, useAppCommands } from "@/ui/commands/appCommands";
import { FOCUS_RING } from "@/ui/focusRing";
import {
  ACTION_SHORTCUT_LABELS,
  tooltipWithShortcut,
} from "@/features/editor/useKeyboardShortcuts";

export function TopBar() {
  const { t } = useTranslation();
  const activeTab = useEditorStore((s) => s.activeTab);
  const setTab = useEditorStore((s) => s.setTab);
  const zen = useEditorStore((s) => s.zen);
  const setZen = useEditorStore((s) => s.setZen);
  const chromeHidden = useEditorStore((s) => s.overlayChromeHidden);
  const setChromeHidden = useEditorStore((s) => s.setOverlayChromeHidden);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const commands = useAppCommands(loadInputRef);

  // Capabilities are stable for the page lifetime: read once, lazily.
  const [webgpu] = useState(isWebGPUSupported);
  const [webcodecs] = useState(isWebCodecsSupported);

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-card px-3 py-1.5 xl:gap-x-4">
      <span className="flex shrink-0 items-center gap-2.5">
        <AppLogo />
        <span className="sr-only whitespace-nowrap text-sm font-bold tracking-tight lg:not-sr-only">
          Morpher<span className="text-primary">91</span>
        </span>
      </span>

      <nav
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5"
        role="tablist"
      >
        {APP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            id={`${tab.id}-tab`}
            data-assist={tab.assistAnchor ?? undefined}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            onClick={() => setTab(tab.id)}
            className={cn(
              "rounded-md px-3 py-1 text-[13px] transition-colors",
              FOCUS_RING,
              activeTab === tab.id
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      <div className="ms-auto flex max-w-full flex-wrap items-center justify-end gap-0.5 xl:gap-2 [&>[data-slot=button]]:px-1.5 [&>[data-slot=button]]:text-xs xl:[&>[data-slot=button]]:px-3 xl:[&>[data-slot=button]]:text-sm">
        <input
          ref={loadInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void commands.loadFile(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          {...assist("topbar.new")}
          onClick={() => void commands.newProject()}
        >
          {t("topbar.new")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          {...assist("topbar.demo")}
          onClick={commands.openDemo}
        >
          {t("demo.button")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          {...assist("topbar.load")}
          onClick={commands.requestLoad}
        >
          {t("topbar.load")}
        </Button>
        <Button
          variant="soft"
          size="sm"
          {...assist("topbar.save")}
          onClick={() => void commands.saveProject()}
          disabled={!commands.hasProject}
        >
          {t("topbar.save")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          {...assist("topbar.export")}
          onClick={commands.openExport}
        >
          {t("topbar.export")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          {...assist("topbar.help")}
          onClick={commands.openHelp}
        >
          {t("topbar.help")}
        </Button>
        <AboutDialog />
        <LanguageMenu />
        <div className="hidden items-center gap-2 xl:flex">
          <span className="mx-1 h-5 w-px bg-border" />
          <TechBadge status={webgpu ? "ok" : "error"}>WebGPU</TechBadge>
          <TechBadge status={webcodecs ? "ok" : "warning"}>WebCodecs</TechBadge>
        </div>
        <button
          type="button"
          title={tooltipWithShortcut(
            t("shell.zen"),
            ACTION_SHORTCUT_LABELS.zen,
          )}
          aria-label={t("shell.zen")}
          aria-keyshortcuts={ACTION_SHORTCUT_LABELS.zen}
          aria-pressed={zen}
          onClick={() => setZen(!zen)}
          className={cn(
            "ml-1 flex size-8 items-center justify-center rounded-md border border-border transition-colors",
            FOCUS_RING,
            zen
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Maximize className="size-3.5" />
        </button>
        <button
          type="button"
          title={tooltipWithShortcut(
            t(chromeHidden ? "shell.showChrome" : "shell.hideChrome"),
            ACTION_SHORTCUT_LABELS.overlayChrome,
          )}
          aria-label={t(chromeHidden ? "shell.showChrome" : "shell.hideChrome")}
          aria-keyshortcuts={ACTION_SHORTCUT_LABELS.overlayChrome}
          aria-pressed={chromeHidden}
          onClick={() => setChromeHidden(!chromeHidden)}
          className={cn(
            "flex size-8 items-center justify-center rounded-md border border-border transition-colors",
            FOCUS_RING,
            chromeHidden
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {chromeHidden ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
        </button>
      </div>
    </header>
  );
}
