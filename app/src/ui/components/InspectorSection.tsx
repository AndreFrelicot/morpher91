import { forwardRef } from "react";
import { Accordion } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore, type InspectorSectionId } from "@/store/editorStore";
import { FOCUS_RING_INSET } from "@/ui/focusRing";

/**
 * Root for the stacked right-inspector sections (M14): a Radix multi-open
 * accordion whose open state lives in editorStore so it survives tab switches.
 */
export function InspectorSections({ children }: { children: React.ReactNode }) {
  const sections = useEditorStore((s) => s.inspectorSections);
  const setOpen = useEditorStore((s) => s.setInspectorSectionOpen);
  const value = (Object.keys(sections) as InspectorSectionId[]).filter(
    (id) => sections[id],
  );

  return (
    <Accordion.Root
      type="multiple"
      value={value}
      onValueChange={(next: string[]) => {
        (Object.keys(sections) as InspectorSectionId[]).forEach((id) => {
          const open = next.includes(id);
          if (open !== sections[id]) setOpen(id, open);
        });
      }}
    >
      {children}
    </Accordion.Root>
  );
}

/** One collapsible, always-present section of the right inspector. */
export const InspectorSection = forwardRef<
  HTMLDivElement,
  {
    id: InspectorSectionId;
    title: string;
    /** Optional inline badge next to the title (e.g. layer algo override). */
    badge?: React.ReactNode;
    /** Briefly highlights the header (selection feedback). */
    flash?: boolean;
    children: React.ReactNode;
  }
>(function InspectorSection({ id, title, badge, flash, children }, ref) {
  return (
    <Accordion.Item ref={ref} value={id} className="border-b border-border">
      <Accordion.Header asChild>
        <h2 className="m-0">
          <Accordion.Trigger
            className={cn(
              "group flex w-full items-center gap-2 px-3 py-2 text-start transition-colors hover:bg-accent/30",
              FOCUS_RING_INSET,
              flash && "animate-pulse bg-accent/60 motion-reduce:animate-none",
            )}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            {badge}
            <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </Accordion.Trigger>
        </h2>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden px-3 pb-3">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
});
