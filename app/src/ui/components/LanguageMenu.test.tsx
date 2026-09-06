import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, * as languageModule from "@/i18n";
import { useKeyboardShortcuts } from "@/features/editor/useKeyboardShortcuts";
import { useEditorStore } from "@/store/editorStore";
import { LanguageMenu } from "./LanguageMenu";
import de from "@/i18n/locales/de.json";

function WithStudioShortcuts() {
  useKeyboardShortcuts();
  return <LanguageMenu />;
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage("en"));
  useEditorStore.getState().resetEditor();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await act(() => i18n.changeLanguage("en"));
});

describe("language dialog", () => {
  it("reveals the last card when focus wraps into a scrolled language list", async () => {
    const user = userEvent.setup();
    render(<LanguageMenu />);
    await user.click(screen.getByRole("button", { name: "Language" }));
    const dialog = screen.getByRole("dialog");
    const cards = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    const last = cards.at(-1)!;
    const list = last.parentElement!.parentElement!;
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 100, 350, 400),
    );
    vi.spyOn(last, "getBoundingClientRect").mockReturnValue(
      new DOMRect(20, 1000, 310, 70),
    );
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    expect(list.scrollTop).toBe(574);
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("keeps keyboard focus inside, blocks studio shortcuts and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<WithStudioShortcuts />);
    const trigger = screen.getByRole("button", { name: "Language" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Language" });
    expect(
      within(dialog).getAllByRole("button", { pressed: true }),
    ).toHaveLength(1);
    for (let index = 0; index < 6; index++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("pu");
    expect(useEditorStore.getState().zen).toBe(false);
    expect(useEditorStore.getState().activeTool).toBe("select");
    expect(useEditorStore.getState().overlayChromeHidden).toBe(false);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("applies and remembers a selection, translating the reopened dialog", async () => {
    const user = userEvent.setup();
    render(<LanguageMenu />);
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("button", { name: /Français.*French/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem("bwm.lang")).toBe("fr");
    expect(document.documentElement).toHaveAttribute("lang", "fr");
    await user.click(screen.getByRole("button", { name: "Langue" }));
    const dialog = screen.getByRole("dialog", { name: "Langue" });
    expect(
      within(dialog).getByRole("button", { pressed: true }),
    ).toHaveTextContent("Français");
    const cards = within(dialog)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the current UI while loading, reports a failure and retries", async () => {
    let reject!: (error: Error) => void;
    const originalChange = languageModule.changeAppLanguage;
    const change = vi
      .spyOn(languageModule, "changeAppLanguage")
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((_, no) => {
            reject = no;
          }),
      )
      .mockImplementation(originalChange);
    const user = userEvent.setup();
    render(<LanguageMenu />);
    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("button", { name: /Français.*French/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Français");
    expect(i18n.language).toBe("en");
    await act(async () => reject(new Error("offline")));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(i18n.language).toBe("en");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(change).toHaveBeenCalledTimes(2);
    expect(i18n.language).toBe("fr");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still changes language when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    await expect(languageModule.changeAppLanguage("fr")).resolves.toBe(true);
    expect(i18n.language).toBe("fr");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("loads a lazy catalogue before applying its interface and manifest", async () => {
    i18n.removeResourceBundle("de", "translation");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(de)));
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.append(manifest);
    try {
      const user = userEvent.setup();
      render(<LanguageMenu />);
      await user.click(screen.getByRole("button", { name: "Language" }));
      await user.click(screen.getByRole("button", { name: /Deutsch.*German/ }));
      expect(
        await screen.findByRole("button", { name: "Sprache" }),
      ).toBeVisible();
      expect(i18n.hasResourceBundle("de", "translation")).toBe(true);
      expect(i18n.t("guideText.output.timelineGuide.title")).toBe(
        "Zeitleiste bedienen",
      );
      expect(localStorage.getItem("bwm.lang")).toBe("de");
      expect(manifest.getAttribute("href")).toBe("/manifest.de.webmanifest");
    } finally {
      manifest.remove();
    }
  });
});
