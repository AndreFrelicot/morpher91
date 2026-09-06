import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useDialogStore } from "@/store/dialogStore";
import { AppDialog } from "./AppDialog";

beforeEach(() => {
  useDialogStore.getState().settle(false);
});

describe("AppDialog", () => {
  it("resolves a confirm with the action button", async () => {
    const user = userEvent.setup();
    render(<AppDialog />);
    let outcome!: Promise<boolean>;

    act(() => {
      outcome = useDialogStore.getState().confirm({
        title: "New project",
        message: "Discard the current project?",
        actionLabel: "Discard",
      });
    });

    const dialog = await screen.findByRole("alertdialog", {
      name: "New project",
    });
    expect(dialog).toHaveTextContent("Discard the current project?");
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(await outcome).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("resolves false on Cancel and on Escape", async () => {
    const user = userEvent.setup();
    render(<AppDialog />);
    let outcome!: Promise<boolean>;

    act(() => {
      outcome = useDialogStore.getState().confirm({ title: "A", message: "B" });
    });
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await outcome).toBe(false);

    act(() => {
      outcome = useDialogStore.getState().confirm({ title: "A", message: "B" });
    });
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    expect(await outcome).toBe(false);
  });

  it("shows an alert with a single OK button", async () => {
    const user = userEvent.setup();
    render(<AppDialog />);
    let outcome!: Promise<void>;

    act(() => {
      outcome = useDialogStore
        .getState()
        .alert({ title: "Load error", message: "Not a project file." });
    });

    await screen.findByRole("alertdialog", { name: "Load error" });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "OK" }));

    await outcome;
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
