import { afterEach, describe, expect, it } from "vitest";
import { installViewportScrollLock } from "./lockViewportScroll";

let cleanup = () => {};

function dispatchTouch(
  target: Element,
  type: "touchstart" | "touchmove" | "touchend",
  x: number,
  y: number,
  touchType?: string,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientX: x, clientY: y, touchType }],
  });
  target.dispatchEvent(event);
  return event;
}

function scrollablePanel({
  top = 0,
  height = 100,
  contentHeight = 200,
}: {
  top?: number;
  height?: number;
  contentHeight?: number;
} = {}): HTMLDivElement {
  const panel = document.createElement("div");
  panel.style.overflowY = "auto";
  Object.defineProperties(panel, {
    clientHeight: { configurable: true, value: height },
    scrollHeight: { configurable: true, value: contentHeight },
  });
  panel.scrollTop = top;
  document.body.append(panel);
  return panel;
}

afterEach(() => {
  cleanup();
  cleanup = () => {};
  document.body.replaceChildren();
});

describe("installViewportScrollLock", () => {
  it("preserves small tap movements but blocks a cumulative drag", () => {
    const button = document.createElement("button");
    document.body.append(button);
    cleanup = installViewportScrollLock();
    dispatchTouch(button, "touchstart", 20, 100);
    expect(dispatchTouch(button, "touchmove", 21, 102).defaultPrevented).toBe(
      false,
    );
    expect(dispatchTouch(button, "touchmove", 22, 105).defaultPrevented).toBe(
      false,
    );
    expect(dispatchTouch(button, "touchmove", 22, 110).defaultPrevented).toBe(
      true,
    );
    expect(dispatchTouch(button, "touchmove", 22, 111).defaultPrevented).toBe(
      true,
    );
  });

  it("never cancels legacy stylus movement", () => {
    cleanup = installViewportScrollLock();
    dispatchTouch(document.body, "touchstart", 20, 100, "stylus");
    expect(
      dispatchTouch(document.body, "touchmove", 60, 140, "stylus")
        .defaultPrevented,
    ).toBe(false);
  });

  it.each(["pointerup", "pointercancel"])(
    "preserves pen input without touchType and resumes finger locking after %s",
    (endType) => {
      cleanup = installViewportScrollLock();
      const penEvent = (type: string) => {
        const event = new Event(type, { bubbles: true });
        Object.defineProperties(event, {
          pointerType: { value: "pen" },
          pointerId: { value: 42 },
        });
        document.body.dispatchEvent(event);
      };
      penEvent("pointerdown");
      dispatchTouch(document.body, "touchstart", 20, 100);
      expect(
        dispatchTouch(document.body, "touchmove", 60, 140).defaultPrevented,
      ).toBe(false);
      penEvent(endType);
      dispatchTouch(document.body, "touchend", 60, 140);
      dispatchTouch(document.body, "touchstart", 20, 100);
      expect(
        dispatchTouch(document.body, "touchmove", 20, 130).defaultPrevented,
      ).toBe(true);
    },
  );

  it("cancels a pull gesture on the fixed document", () => {
    cleanup = installViewportScrollLock();

    dispatchTouch(document.body, "touchstart", 20, 100);
    const move = dispatchTouch(document.body, "touchmove", 20, 130);

    expect(move.defaultPrevented).toBe(true);
  });

  it("allows an inner panel to consume vertical movement", () => {
    const panel = scrollablePanel({ top: 50 });
    cleanup = installViewportScrollLock();

    dispatchTouch(panel, "touchstart", 20, 100);
    const move = dispatchTouch(panel, "touchmove", 20, 80);

    expect(move.defaultPrevented).toBe(false);
  });

  it("cancels scroll chaining at the top and bottom of an inner panel", () => {
    const panel = scrollablePanel();
    cleanup = installViewportScrollLock();

    dispatchTouch(panel, "touchstart", 20, 100);
    const pullPastTop = dispatchTouch(panel, "touchmove", 20, 130);
    expect(pullPastTop.defaultPrevented).toBe(true);

    dispatchTouch(panel, "touchend", 20, 130);
    panel.scrollTop = 100;
    dispatchTouch(panel, "touchstart", 20, 100);
    const pushPastBottom = dispatchTouch(panel, "touchmove", 20, 70);
    expect(pushPastBottom.defaultPrevented).toBe(true);
  });

  it("keeps horizontal native range dragging available", () => {
    const range = document.createElement("input");
    range.type = "range";
    document.body.append(range);
    cleanup = installViewportScrollLock();

    dispatchTouch(range, "touchstart", 20, 20);
    const move = dispatchTouch(range, "touchmove", 80, 20);

    expect(move.defaultPrevented).toBe(false);
  });

  it("removes every document listener during cleanup", () => {
    cleanup = installViewportScrollLock();
    cleanup();
    cleanup = () => {};

    dispatchTouch(document.body, "touchstart", 20, 100);
    const move = dispatchTouch(document.body, "touchmove", 20, 130);

    expect(move.defaultPrevented).toBe(false);
  });
});
