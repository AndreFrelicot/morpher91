import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { useEditorStore } from "@/store/editorStore";
import { TOOLS } from "@/ui/layout/toolList";
import {
  TOOL_ARIA_SHORTCUTS,
  TOOL_SHORTCUT_LABELS,
  tooltipWithShortcut,
} from "@/features/editor/useKeyboardShortcuts";

/** Slim vertical tool rail on the far left of the studio shell. */
export function ToolRail() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const leftOpen = useEditorStore((s) => s.panelsOpen.left);
  const setPanelOpen = useEditorStore((s) => s.setPanelOpen);

  return (
    <aside className="flex w-12 flex-col items-center gap-0.5 border-e border-border bg-card py-2">
      {TOOLS.map(({ id, Icon }) => (
        <button
          key={id}
          type="button"
          {...assist(`tools.${id}`)}
          title={tooltipWithShortcut(
            t(`tools.${id}`),
            TOOL_SHORTCUT_LABELS[id],
          )}
          aria-label={t(`tools.${id}`)}
          aria-keyshortcuts={TOOL_ARIA_SHORTCUTS[id]}
          aria-pressed={activeTool === id}
          onClick={() => setTool(id)}
          className={cn(
            "flex size-[34px] items-center justify-center rounded-lg transition-colors",
            FOCUS_RING,
            activeTool === id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
      <span className="my-2 h-px w-[22px] bg-border" />
      <button
        type="button"
        title={t("shell.panels.left")}
        aria-label={t("shell.panels.left")}
        aria-pressed={leftOpen}
        onClick={() => setPanelOpen("left", !leftOpen)}
        className={cn(
          "flex size-[34px] items-center justify-center rounded-lg transition-colors",
          FOCUS_RING,
          leftOpen
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <PanelLeft className="size-4" />
      </button>
    </aside>
  );
}
