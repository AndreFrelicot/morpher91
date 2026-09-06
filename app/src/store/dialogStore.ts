import { create } from "zustand";

export type DialogRequest = {
  kind: "confirm" | "alert";
  title: string;
  message: string;
  /** Label of the confirming button; defaults to the localized "OK". */
  actionLabel?: string;
  /** Styles the confirming button as destructive (discard, overwrite…). */
  destructive?: boolean;
};

type PendingDialog = {
  request: DialogRequest;
  resolve: (confirmed: boolean) => void;
};

type DialogState = {
  pending: PendingDialog | null;
  /** In-app replacement for window.confirm: false on cancel, Escape or dismissal. */
  confirm: (request: Omit<DialogRequest, "kind">) => Promise<boolean>;
  /** In-app replacement for window.alert: resolves once acknowledged. */
  alert: (
    request: Omit<DialogRequest, "kind" | "actionLabel" | "destructive">,
  ) => Promise<void>;
  /** Called by the dialog host; a no-op when nothing is pending. */
  settle: (confirmed: boolean) => void;
};

export const useDialogStore = create<DialogState>((set, get) => {
  const open = (request: DialogRequest) =>
    new Promise<boolean>((resolve) => {
      // A newer request supersedes a pending one, which reads as dismissed.
      get().pending?.resolve(false);
      set({ pending: { request, resolve } });
    });

  return {
    pending: null,
    confirm: (request) => open({ kind: "confirm", ...request }),
    alert: async (request) => {
      await open({ kind: "alert", ...request });
    },
    settle: (confirmed) => {
      const { pending } = get();
      if (!pending) return;
      set({ pending: null });
      pending.resolve(confirmed);
    },
  };
});
