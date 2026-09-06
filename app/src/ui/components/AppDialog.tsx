import { ModalBackdrop } from "@/ui/components/ModalBackdrop";
import { cn } from "@/lib/utils";
import { dialogStyles } from "@/ui/components/dialogStyles";
import { AlertDialog } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/ui/button";
import { useDialogStore } from "@/store/dialogStore";

/**
 * Host for the in-app confirm/alert dialogs requested through the dialog
 * store. Sits above every other surface (modals, assistant overlay) since a
 * command can ask for confirmation from any of them.
 */
export function AppDialog() {
  const { t } = useTranslation();
  const request = useDialogStore((s) => s.pending?.request ?? null);
  const settle = useDialogStore((s) => s.settle);

  return (
    <AlertDialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialog.Portal>
        <ModalBackdrop className="z-[100]" />
        <AlertDialog.Content
          className={cn(
            dialogStyles.position,
            dialogStyles.surface,
            "z-[101] w-[min(28rem,calc(100vw-2rem))] p-6",
          )}
        >
          <AlertDialog.Title className={dialogStyles.title}>
            {request?.title}
          </AlertDialog.Title>
          <AlertDialog.Description className={dialogStyles.description}>
            {request?.message}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {request?.kind === "confirm" && (
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm">
                  {t("dialog.cancel")}
                </Button>
              </AlertDialog.Cancel>
            )}
            <AlertDialog.Action asChild>
              <Button
                variant={request?.destructive ? "destructive" : "default"}
                size="sm"
                onClick={() => settle(true)}
              >
                {request?.actionLabel ?? t("dialog.ok")}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
