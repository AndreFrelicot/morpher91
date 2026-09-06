import { useRef, useState, type ButtonHTMLAttributes } from "react";
import { MoreVertical, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LanguageMenu } from "@/ui/components/LanguageMenu";
import { AboutDialog } from "@/ui/components/AboutDialog";
import { TechBadge } from "@/ui/components/TechBadge";
import {
  isWebCodecsSupported,
  isWebGPUSupported,
} from "@/lib/gpu/capabilities";
import { assist } from "@/assist/anchors";
import { useEditorStore } from "@/store/editorStore";
import { APP_TABS, useAppCommands } from "@/ui/commands/appCommands";
import { FOCUS_RING } from "@/ui/focusRing";

/**
 * Compact top bar for the mobile shell (PRD M12 lot 2): the tab strip plus an
 * inspector-sheet toggle and an overflow menu that folds away New/Load/Save/Help
 * and the capability badges, which do not fit a phone width.
 */
export function MobileTopBar({
  onOpenInspector,
}: {
  onOpenInspector: () => void;
}) {
  const { t } = useTranslation();
  const activeTab = useEditorStore((s) => s.activeTab);
  const setTab = useEditorStore((s) => s.setTab);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const commands = useAppCommands(loadInputRef, () => setMenuOpen(false));
  const showInspector = activeTab === "studio" || activeTab === "compare";

  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-2">
      <nav
        className="flex flex-1 items-center gap-1 overflow-x-auto"
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
              "shrink-0 rounded-md px-3 py-1 text-sm transition-colors",
              FOCUS_RING,
              activeTab === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      {showInspector && (
        <button
          type="button"
          aria-label={t("mobile.inspector")}
          onClick={onOpenInspector}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <SlidersHorizontal className="size-4" />
        </button>
      )}

      <button
        type="button"
        aria-label={t("mobile.more")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <MoreVertical className="size-4" />
      </button>

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

      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-2 top-11 z-50 w-44 rounded-md border border-border bg-popover p-1 shadow-xl">
            <MenuItem
              {...assist("topbar.new")}
              onClick={() => void commands.newProject()}
            >
              {t("topbar.new")}
            </MenuItem>
            <MenuItem {...assist("topbar.demo")} onClick={commands.openDemo}>
              {t("demo.button")}
            </MenuItem>
            <MenuItem {...assist("topbar.load")} onClick={commands.requestLoad}>
              {t("topbar.load")}…
            </MenuItem>
            <MenuItem
              {...assist("topbar.save")}
              onClick={() => void commands.saveProject()}
              disabled={!commands.hasProject}
            >
              {t("topbar.save")}
            </MenuItem>
            <MenuItem
              {...assist("topbar.export")}
              onClick={commands.openExport}
            >
              {t("topbar.export")}
            </MenuItem>
            <MenuItem {...assist("topbar.help")} onClick={commands.openHelp}>
              {t("topbar.help")}
            </MenuItem>
            <AboutDialog className="h-auto w-full justify-start px-2 py-2 font-normal" />
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center gap-2 px-2 py-1">
              <LanguageMenu />
            </div>
            <div className="flex items-center gap-2 px-2 py-1">
              <TechBadge status={isWebGPUSupported() ? "ok" : "error"}>
                WebGPU
              </TechBadge>
              <TechBadge status={isWebCodecsSupported() ? "ok" : "warning"}>
                WebCodecs
              </TechBadge>
            </div>
          </div>
        </>
      )}
    </header>
  );
}

function MenuItem({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "block w-full rounded px-2 py-2 text-start text-sm text-foreground hover:bg-accent/50 disabled:opacity-40",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </button>
  );
}
