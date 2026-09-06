import { FOCUS_RING } from "@/ui/focusRing";

/** Shared visual language; each surface keeps its own sizing and behavior. */
export const dialogStyles = {
  overlay: "fixed inset-0 bg-black/60 backdrop-blur-sm",
  surface:
    "rounded-2xl border border-dialog-border bg-card font-sans text-sm leading-relaxed text-card-foreground shadow-2xl",
  position: "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  header:
    "flex shrink-0 items-start justify-between gap-4 border-b border-border p-5 sm:p-6",
  title: "text-xl font-semibold leading-7 tracking-tight",
  description: "mt-1 text-sm leading-relaxed text-muted-foreground",
  sectionTitle:
    "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
  close: `flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-dialog-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`,
  footer: "shrink-0 border-t border-border px-5 py-4 sm:px-6",
} as const;
