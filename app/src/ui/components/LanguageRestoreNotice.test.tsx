import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import i18n, * as language from "@/i18n";
import { LanguageRestoreNotice } from "./LanguageRestoreNotice";
import de from "@/i18n/locales/de.json";

beforeEach(async () => {
  await act(() => i18n.changeLanguage("en"));
  language.languageStartup.failed = "de";
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  language.languageStartup.failed = null;
  await act(() => i18n.changeLanguage("en"));
});

it("explains the fallback, keeps retry after failure and dismisses after a successful retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(de)));
  const user = userEvent.setup();
  const original = language.changeAppLanguage;
  vi.spyOn(language, "changeAppLanguage")
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(original);
  render(<LanguageRestoreNotice />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Could not restore German",
  );
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "The interface is in English",
  );
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(i18n.language).toBe("de");
});

it("allows dismissing the notice without forgetting the stored preference", async () => {
  localStorage.setItem("bwm.lang", "de");
  const user = userEvent.setup();
  render(<LanguageRestoreNotice />);
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(localStorage.getItem("bwm.lang")).toBe("de");
});
