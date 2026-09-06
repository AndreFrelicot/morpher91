import { cn } from "@/lib/utils";

type TechStatus = "ok" | "warning" | "error";

const statusStyles: Record<TechStatus, string> = {
  ok: "border-border text-primary",
  warning: "border-amber-500/40 text-amber-400",
  error: "border-red-500/40 text-red-400",
};

const dotStyles: Record<TechStatus, string> = {
  ok: "bg-primary",
  warning: "bg-amber-400",
  error: "bg-red-400",
};

export function TechBadge({
  status,
  children,
}: {
  status: TechStatus;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-tight",
        statusStyles[status],
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotStyles[status])} />
      {children}
    </span>
  );
}
