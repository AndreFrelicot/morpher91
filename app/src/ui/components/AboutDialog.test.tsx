import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { version } from "../../../package.json";
import { useKeyboardShortcuts } from "@/features/editor/useKeyboardShortcuts";
import { useEditorStore } from "@/store/editorStore";
import { AboutDialog } from "./AboutDialog";

function WithStudioShortcuts() {
  useKeyboardShortcuts();
  return <AboutDialog />;
}

afterEach(async () => {
  await act(() => i18n.changeLanguage("en"));
  useEditorStore.getState().resetEditor();
});

describe("AboutDialog", () => {
  it("opens the credits and restores focus when closed with Escape", async () => {
    const user = userEvent.setup();
    render(<WithStudioShortcuts />);
    const trigger = screen.getByRole("button", { name: "About" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Morpher91" });
    expect(dialog).toHaveTextContent(`v${version}`);
    expect(dialog).toHaveTextContent("Created by André Frélicot.");
    expect(
      screen.getByRole("link", { name: "andrefrelicot.dev" }),
    ).toHaveAttribute("href", "https://andrefrelicot.dev");
    // Tab from a link used to bubble to the studio's zen-mode shortcut.
    await user.tab();
    await user.keyboard("u");
    await user.tab();
    expect(useEditorStore.getState().zen).toBe(false);
    expect(useEditorStore.getState().overlayChromeHidden).toBe(false);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("shows French credits and closes with the visible close button", async () => {
    await act(() => i18n.changeLanguage("fr"));
    const user = userEvent.setup();
    render(<AboutDialog />);
    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Confidentialité");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Créé par André Frélicot.",
    );
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
