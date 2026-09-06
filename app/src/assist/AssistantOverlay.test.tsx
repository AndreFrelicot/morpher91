import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useEditorStore } from "@/store/editorStore";
import type { Guide, L } from "./guides/types";
import { useAssistStore } from "./assistStore";
import { AssistantOverlay } from "./AssistantOverlay";
import { installViewportScrollLock } from "@/lib/viewport/lockViewportScroll";

vi.mock("./guides", () => {
  const guide: Guide = {
    id: "manual-test",
    title: "testGuide.title" as L,
    description: "testGuide.description" as L,
    keywords: "testGuide.keywords" as L,
    category: "start",
    steps: [0, 1, 2].map((index) => ({
      id: String(index),
      anchor: null,
      title: `testGuide.step${index + 1}` as L,
      body: "testGuide.body" as L,
      done: ({ editor }) => editor.activeTool === "point",
    })),
  };
  return { getGuide: (id: string) => (id === guide.id ? guide : null) };
});

beforeEach(async () => {
  vi.useFakeTimers();
  useAssistStore.getState().quit();
  useEditorStore.getState().resetEditor();
  for (const [language, title, step, body] of [
    ["en", "Manual guide", "Step", "Select the Point tool."],
    ["fr", "Guide manuel", "Étape", "Sélectionnez l’outil Point."],
  ]) {
    i18n.addResourceBundle(
      language,
      "translation",
      {
        testGuide: {
          title,
          description: "Test",
          keywords: "test",
          body,
          step1: `${step} 1`,
          step2: `${step} 2`,
          step3: `${step} 3`,
        },
      },
      true,
      true,
    );
  }
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.useRealTimers();
});

function start(satisfied = true) {
  useEditorStore.setState({ activeTool: satisfied ? "point" : "select" });
  useAssistStore.getState().startGuide("manual-test");
  render(<AssistantOverlay />);
}

function waitPastOldAutoAdvance() {
  act(() => vi.advanceTimersByTime(5_000));
}

describe("manual guide navigation", () => {
  it("does not suppress the Pencil tap used to advance a completed step", () => {
    const unlock = installViewportScrollLock();
    try {
      start();
      const next = screen.getByRole("button", { name: "Next" });
      fireEvent.touchStart(next, {
        touches: [{ clientX: 20, clientY: 20, touchType: "stylus" }],
      });
      expect(
        fireEvent.touchMove(next, {
          touches: [{ clientX: 22, clientY: 21, touchType: "stylus" }],
        }),
      ).toBe(true);
      fireEvent.touchEnd(next, { touches: [] });
      // jsdom does not synthesize the browser's compatibility click.
      expect(screen.getByText("Step 1")).toBeVisible();
      fireEvent.click(next);
      expect(screen.getByText("Step 2")).toBeVisible();
    } finally {
      unlock();
    }
  });

  it("keeps an already satisfied first step visible until Next is clicked", () => {
    start();
    expect(screen.getByRole("status")).toHaveTextContent("Step complete");
    waitPastOldAutoAdvance();
    expect(screen.getByText("Step 1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    waitPastOldAutoAdvance();
    expect(screen.getByText("Step 2")).toBeVisible();
  });

  it("updates success feedback after an action without advancing, and clears it if undone", () => {
    start(false);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => useEditorStore.setState({ activeTool: "point" }));
    expect(screen.getByRole("status")).toHaveTextContent("Step complete");
    waitPastOldAutoAdvance();
    expect(screen.getByText("Step 1")).toBeVisible();
    act(() => useEditorStore.setState({ activeTool: "select" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Step 1")).toBeVisible();
  });

  it("stays on a completed step after Back, and only closes the last step on Done", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    waitPastOldAutoAdvance();
    expect(screen.getByText("Step 1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    waitPastOldAutoAdvance();
    expect(screen.getByText("Step 3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows manual progression without satisfying the condition and can quit", () => {
    start(false);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Quit the guide" }));
    waitPastOldAutoAdvance();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows French feedback and recomputes it when restarting the same guide", async () => {
    await i18n.changeLanguage("fr");
    start();
    act(() => useAssistStore.getState().startGuide("manual-test"));
    expect(screen.getByRole("status")).toHaveTextContent("Étape validée");
    waitPastOldAutoAdvance();
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByText("Étape 2")).toBeVisible();
  });
});
