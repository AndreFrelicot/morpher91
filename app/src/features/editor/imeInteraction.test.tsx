import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useSpaceHeld } from "./useSpaceHeld";

const initialEditor = useEditorStore.getState();

beforeEach(() => useEditorStore.getState().resetEditor());
afterEach(() => useEditorStore.setState(initialEditor, true));

function useStudioKeyboard() {
  useKeyboardShortcuts();
  return useSpaceHeld();
}

describe("studio keyboard listeners during composition", () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "does not activate tools, move time or pan with %j",
    (composition) => {
      const { result } = renderHook(useStudioKeyboard);
      const before = useEditorStore.getState();
      for (const [key, code] of [
        ["p", "KeyP"],
        ["Tab", "Tab"],
        ["u", "KeyU"],
        ["ArrowRight", "ArrowRight"],
        [" ", "Space"],
      ]) {
        const event = new KeyboardEvent("keydown", {
          key,
          code,
          bubbles: true,
          cancelable: true,
          ...composition,
        });
        act(() => document.body.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(useEditorStore.getState()).toBe(before);
        expect(result.current).toBe(false);
      }

      // Positive controls: the same mounted listeners still work after composing.
      fireEvent.keyDown(document.body, { key: "p", code: "KeyP" });
      expect(useEditorStore.getState().activeTool).toBe("point");
      fireEvent.keyDown(document.body, { key: " ", code: "Space" });
      expect(result.current).toBe(true);
      fireEvent.keyUp(document.body, { key: " ", code: "Space" });
      expect(result.current).toBe(false);
    },
  );

  it("leaves committed text and candidate-navigation keys to the focused field", () => {
    const { result } = renderHook(useStudioKeyboard);
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    try {
      const before = useEditorStore.getState();
      fireEvent.compositionStart(input, { data: "" });
      fireEvent.compositionUpdate(input, { data: "にほん" });
      fireEvent.keyDown(input, { key: " ", code: "Space", isComposing: true });
      fireEvent.keyDown(input, { key: "ArrowRight", isComposing: true });
      fireEvent.compositionEnd(input, { data: "日本語" });
      fireEvent.input(input, {
        target: { value: "日本語" },
        inputType: "insertFromComposition",
      });
      // A final key can have isComposing=false; a text field must still own it.
      fireEvent.keyDown(input, { key: "Enter", isComposing: false });
      fireEvent.keyDown(input, { key: "p", code: "KeyP", isComposing: false });
      fireEvent.keyDown(input, { key: " ", code: "Space", isComposing: false });
      expect(input.value).toBe("日本語");
      expect(useEditorStore.getState()).toBe(before);
      expect(result.current).toBe(false);
    } finally {
      input.remove();
    }
  });
});
