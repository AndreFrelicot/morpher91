import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { dialogStyles } from "./dialogStyles";

/**
 * Use inside Dialog.Portal / AlertDialog.Portal, which own open/close presence.
 * The fixed app viewport already owns scroll locking. Radix Overlay adds a
 * second RemoveScroll guard that cancels Pencil touchmoves and native clicks.
 * Content still owns modal focus, outside dismissal and background isolation.
 */
export function ModalBackdrop({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(dialogStyles.overlay, "pointer-events-auto", className)}
    />
  );
}
