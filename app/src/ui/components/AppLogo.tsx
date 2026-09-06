import { cn } from "@/lib/utils";

/** Original artwork, kept intact; the adjacent app name supplies its label. */
export function AppLogo({ className }: { className?: string }) {
  return (
    <img
      src="/icon-192x192.png"
      alt=""
      width={192}
      height={192}
      draggable={false}
      className={cn("size-8 shrink-0 rounded-md object-contain", className)}
    />
  );
}
