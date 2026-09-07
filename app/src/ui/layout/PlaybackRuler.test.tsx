import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { PlaybackRuler } from "./PlaybackRuler";
import { installViewportScrollLock } from "@/lib/viewport/lockViewportScroll";
import { buildRulerTicks } from "./timelineFormat";

const position = () => i18n.t("timeline.position");

function pointerEvent(
  target: HTMLElement,
  type: string,
  x: number,
  id = 1,
  pointerType = "pen",
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: -20,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: id },
  });
  fireEvent(target, event);
  return event;
}

function mockRulerBounds(slider: HTMLElement) {
  const captured = new Set<number>();
  slider.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  slider.hasPointerCapture = (id) => captured.has(id);
  slider.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
  });
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
    left: 100,
    width: 400,
  } as DOMRect);
}

describe("PlaybackRuler", () => {
  it.each([
    [false, "pen"],
    [true, "pen"],
    [false, "touch"],
    [true, "touch"],
  ] as const)(
    "scrubs immediately with capture, including outside the ruler (compact=%s, pointer=%s)",
    (compact, pointerType) => {
      const onChange = vi.fn();
      render(
        <PlaybackRuler
          compact={compact}
          durationSec={10}
          fps={30}
          tauSec={0}
          onChange={onChange}
        />,
      );
      const slider = screen.getByRole("slider");
      mockRulerBounds(slider);
      expect(
        pointerEvent(slider, "pointerdown", 260, 1, pointerType)
          .defaultPrevented,
      ).toBe(true);
      expect(onChange).toHaveBeenLastCalledWith(4);
      expect(slider.setPointerCapture).toHaveBeenCalledWith(1);
      pointerEvent(slider, "pointermove", 380, 1, pointerType);
      expect(onChange).toHaveBeenLastCalledWith(7);
      pointerEvent(slider, "pointermove", 180, 1, pointerType);
      expect(onChange).toHaveBeenLastCalledWith(2);
      pointerEvent(slider, "pointermove", 50, 1, pointerType);
      expect(onChange).toHaveBeenLastCalledWith(0);
      pointerEvent(slider, "pointermove", 600, 1, pointerType);
      expect(onChange).toHaveBeenLastCalledWith(10);
      pointerEvent(slider, "pointerup", 300, 1, pointerType);
      expect(onChange).toHaveBeenLastCalledWith(5);
      expect(slider.releasePointerCapture).toHaveBeenCalledWith(1);
      onChange.mockClear();
      pointerEvent(slider, "pointermove", 400, 1, pointerType);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["pointercancel", "pen"],
    ["lostpointercapture", "pen"],
    ["pointercancel", "touch"],
    ["lostpointercapture", "touch"],
  ])(
    "ends scrubbing on %s with %s and ignores other pointers",
    (endType, pointerType) => {
      const onChange = vi.fn();
      render(
        <PlaybackRuler
          durationSec={10}
          fps={30}
          tauSec={0}
          onChange={onChange}
        />,
      );
      const slider = screen.getByRole("slider");
      mockRulerBounds(slider);
      pointerEvent(slider, "pointerdown", 200, 1, pointerType);
      onChange.mockClear();
      pointerEvent(slider, "pointerdown", 400, 2, pointerType);
      pointerEvent(slider, "pointermove", 400, 2, pointerType);
      pointerEvent(slider, "pointerup", 400, 2, pointerType);
      expect(onChange).not.toHaveBeenCalled();
      pointerEvent(slider, endType, 400, 1, pointerType);
      pointerEvent(slider, "pointermove", 400, 1, pointerType);
      expect(onChange).not.toHaveBeenCalled();
      pointerEvent(slider, "pointerdown", 300, 3, pointerType);
      expect(onChange).toHaveBeenLastCalledWith(5);
    },
  );

  it("preserves a diagonal finger drag with the document scroll lock installed", () => {
    const onChange = vi.fn();
    render(
      <PlaybackRuler
        durationSec={10}
        fps={30}
        tauSec={0}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider");
    mockRulerBounds(slider);
    const unlock = installViewportScrollLock();
    const touch = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: x, clientY: y }],
      });
      fireEvent(slider, event);
      return event;
    };
    try {
      expect(slider).toHaveStyle({ touchAction: "none" });
      pointerEvent(slider, "pointerdown", 260, 1, "touch");
      touch("touchstart", 260, 0);
      expect(touch("touchmove", 280, 80).defaultPrevented).toBe(false);
      pointerEvent(slider, "pointermove", 280, 1, "touch");
      expect(onChange).toHaveBeenLastCalledWith(4.5);
      pointerEvent(slider, "pointerup", 300, 1, "touch");
      expect(onChange).toHaveBeenLastCalledWith(5);
    } finally {
      unlock();
    }
  });

  it("leaves mouse input native", () => {
    const onChange = vi.fn();
    render(
      <PlaybackRuler
        durationSec={10}
        fps={30}
        tauSec={0}
        onChange={onChange}
      />,
    );
    const slider = screen.getByRole("slider");
    mockRulerBounds(slider);
    expect(
      pointerEvent(slider, "pointerdown", 260, 1, "mouse").defaultPrevented,
    ).toBe(false);
    expect(slider.setPointerCapture).not.toHaveBeenCalled();
    fireEvent.change(slider, { target: { value: "4" } });
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it("labels the major ticks with timecodes", () => {
    render(
      <PlaybackRuler
        compact
        durationSec={4}
        fps={30}
        tauSec={0}
        onChange={vi.fn()}
      />,
    );

    for (const timecode of ["00:00", "01:00", "02:00", "03:00", "04:00"]) {
      expect(screen.getByText(timecode)).toBeInTheDocument();
    }
  });

  it("draws every tick of the ruler, majors and minors alike", () => {
    const { container } = render(
      <PlaybackRuler
        compact
        durationSec={4}
        fps={30}
        tauSec={0}
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelectorAll("span.w-px")).toHaveLength(
      buildRulerTicks(4).length,
    );
  });

  it("keeps the playhead slider on τ", () => {
    const { rerender } = render(
      <PlaybackRuler
        compact
        durationSec={10}
        fps={30}
        tauSec={2.5}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(position())).toHaveValue("2.5");

    rerender(
      <PlaybackRuler
        compact
        durationSec={10}
        fps={30}
        tauSec={7}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(position())).toHaveValue("7");
  });

  it("clamps τ outside the timeline onto the ruler", () => {
    render(
      <PlaybackRuler
        compact
        durationSec={10}
        fps={30}
        tauSec={42}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(position())).toHaveValue("10");
  });

  it("scrubs the timeline when the slider changes", () => {
    const onChange = vi.fn();
    render(
      <PlaybackRuler
        compact
        durationSec={10}
        fps={30}
        tauSec={0}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(position()), {
      target: { value: "6.25" },
    });

    expect(onChange).toHaveBeenCalledWith(6.25);
  });
});
