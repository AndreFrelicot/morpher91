import { describe, expect, it } from "vitest";
import {
  isTextTarget,
  resolveKeyboardShortcut,
  tooltipWithShortcut,
} from "./useKeyboardShortcuts";

describe("keyboard shortcuts", () => {
  it("maps tool shortcut keys", () => {
    expect(resolveKeyboardShortcut({ key: "v" })).toEqual({
      type: "set-tool",
      tool: "select",
    });
    expect(resolveKeyboardShortcut({ key: "B" })).toEqual({
      type: "set-tool",
      tool: "brush",
    });
    expect(resolveKeyboardShortcut({ key: "p" })).toEqual({
      type: "set-tool",
      tool: "point",
    });
    expect(resolveKeyboardShortcut({ key: "l" })).toEqual({
      type: "set-tool",
      tool: "line",
    });
    expect(resolveKeyboardShortcut({ key: "y" })).toEqual({
      type: "set-tool",
      tool: "polyline",
    });
    expect(resolveKeyboardShortcut({ key: "h" })).toEqual({
      type: "set-tool",
      tool: "pan",
    });
  });

  it("maps undo, redo and timeline keys", () => {
    expect(resolveKeyboardShortcut({ key: "z", metaKey: true })).toEqual({
      type: "undo",
    });
    expect(
      resolveKeyboardShortcut({ key: "z", ctrlKey: true, shiftKey: true }),
    ).toEqual({ type: "redo" });
    expect(resolveKeyboardShortcut({ key: "ArrowLeft" })).toEqual({
      type: "shift-frame",
      delta: -1,
    });
    expect(resolveKeyboardShortcut({ key: "End" })).toEqual({
      type: "set-t",
      value: 1,
    });
  });

  it("maps U to the overlay chrome toggle", () => {
    expect(resolveKeyboardShortcut({ key: "u" })).toEqual({
      type: "toggle-overlay-chrome",
    });
    expect(resolveKeyboardShortcut({ key: "U" })).toEqual({
      type: "toggle-overlay-chrome",
    });
    expect(resolveKeyboardShortcut({ key: "u", metaKey: true })).toBeNull();
  });

  it("maps plain Tab to zen mode but keeps Shift+Tab for focus", () => {
    expect(resolveKeyboardShortcut({ key: "Tab" })).toEqual({
      type: "toggle-zen",
    });
    expect(resolveKeyboardShortcut({ key: "Tab", shiftKey: true })).toBeNull();
    const input = document.createElement("input");
    expect(resolveKeyboardShortcut({ key: "Tab", target: input })).toBeNull();
  });

  it("ignores text targets and unrelated modified shortcuts", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    expect(isTextTarget(input)).toBe(true);
    expect(isTextTarget(button)).toBe(true);
    expect(resolveKeyboardShortcut({ key: "v", target: input })).toBeNull();
    expect(resolveKeyboardShortcut({ key: "p", target: button })).toBeNull();
    expect(resolveKeyboardShortcut({ key: "s", metaKey: true })).toBeNull();
    expect(resolveKeyboardShortcut({ key: "l", altKey: true })).toBeNull();
  });

  it.each(["p", "Tab", "Delete", "ArrowLeft", "z"])(
    "ignores %s during IME composition",
    (key) => {
      expect(resolveKeyboardShortcut({ key, isComposing: true })).toBeNull();
      expect(resolveKeyboardShortcut({ key, keyCode: 229 })).toBeNull();
    },
  );

  it("formats tooltip shortcuts", () => {
    expect(tooltipWithShortcut("Point", "B/P")).toBe("Point (B/P)");
    expect(tooltipWithShortcut("Help")).toBe("Help");
  });
});
