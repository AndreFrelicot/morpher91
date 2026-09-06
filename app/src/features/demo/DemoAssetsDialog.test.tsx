import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { installViewportScrollLock } from "@/lib/viewport/lockViewportScroll";
import { useEditorStore } from "@/store/editorStore";
import { DemoAssetsDialog } from "./DemoAssetsDialog";

vi.mock("./loadDemoAssets", () => ({
  fetchDemoManifest: vi
    .fn()
    .mockResolvedValue({ version: 1, assets: [], presets: [] }),
  loadDemoAssetIntoSlot: vi.fn(),
  loadDemoPreset: vi.fn(),
}));

afterEach(() => {
  cleanup();
  useEditorStore.getState().setDemoDialogOpen(false);
});

function penTap(target: HTMLElement) {
  const down = new Event("pointerdown", { bubbles: true });
  Object.defineProperties(down, {
    pointerId: { value: 42 },
    pointerType: { value: "pen" },
    button: { value: 0 },
  });
  fireEvent(target, down);
  const touch = { clientX: 20, clientY: 20, identifier: 42, target };
  fireEvent.touchStart(target, { touches: [touch], changedTouches: [touch] });
  const moved = { ...touch, clientX: 22, clientY: 21 };
  expect(
    fireEvent.touchMove(target, {
      touches: [moved],
      changedTouches: [moved],
    }),
    `Pencil touchmove cancelled on ${target.textContent}`,
  ).toBe(true);
  const up = new Event("pointerup", { bubbles: true });
  Object.defineProperty(up, "pointerId", { value: 42 });
  fireEvent(target, up);
  fireEvent.touchEnd(target, { touches: [], changedTouches: [moved] });
  // jsdom does not synthesize Safari's click after an uncancelled touch.
  fireEvent.click(target);
}

it("preserves Pencil taps on Assets, Presets and all three media filters inside the real modal", async () => {
  const unlock = installViewportScrollLock();
  try {
    useEditorStore.getState().setDemoDialogOpen(true);
    await act(async () => {
      render(<DemoAssetsDialog />);
    });
    for (const name of ["Presets", "Assets"]) {
      const tab = screen.getByRole("tab", { name });
      penTap(tab);
      expect(tab).toHaveAttribute("aria-selected", "true");
    }
    for (const name of ["Images", "Videos", "All"]) {
      const filter = screen.getByRole("button", { name });
      penTap(filter);
      expect(filter).toHaveAttribute("aria-pressed", "true");
    }
  } finally {
    unlock();
  }
});
