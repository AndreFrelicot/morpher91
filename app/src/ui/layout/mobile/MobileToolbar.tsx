import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editorStore";
import { FOCUS_RING } from "@/ui/focusRing";
import { TOOLS } from "@/ui/layout/toolList";

export function MobileToolbar() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-card px-2 py-2">
      {TOOLS.map(({ id, Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={t(`tools.${id}`)}
          aria-pressed={activeTool === id}
          onClick={() => setTool(id)}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors",
            FOCUS_RING,
            activeTool === id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-5" />
        </button>
      ))}
    </div>
  );
}
