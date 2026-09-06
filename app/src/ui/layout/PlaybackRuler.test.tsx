import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { PlaybackRuler } from "./PlaybackRuler";
import { buildRulerTicks } from "./timelineFormat";

const position = () => i18n.t("timeline.position");

function penEvent(target: HTMLElement, type: string, x: number, id = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: -20,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerType: { value: "pen" },
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
  it.each([false, true])(
    "scrubs immediately with a captured Pencil, including outside the ruler (compact=%s)",
    (compact) => {
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
      expect(penEvent(slider, "pointerdown", 260).defaultPrevented).toBe(true);
      expect(onChange).toHaveBeenLastCalledWith(4);
      expect(slider.setPointerCapture).toHaveBeenCalledWith(1);
      penEvent(slider, "pointermove", 380);
      expect(onChange).toHaveBeenLastCalledWith(7);
      penEvent(slider, "pointermove", 180);
      expect(onChange).toHaveBeenLastCalledWith(2);
      penEvent(slider, "pointermove", 50);
      expect(onChange).toHaveBeenLastCalledWith(0);
      penEvent(slider, "pointermove", 600);
      expect(onChange).toHaveBeenLastCalledWith(10);
      penEvent(slider, "pointerup", 300);
      expect(onChange).toHaveBeenLastCalledWith(5);
      expect(slider.releasePointerCapture).toHaveBeenCalledWith(1);
      onChange.mockClear();
      penEvent(slider, "pointermove", 400);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it.each(["pointercancel", "lostpointercapture"])(
    "ends Pencil scrubbing on %s and ignores other pointers",
    (endType) => {
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
      penEvent(slider, "pointerdown", 200);
      onChange.mockClear();
      penEvent(slider, "pointerdown", 400, 2);
      penEvent(slider, "pointermove", 400, 2);
      penEvent(slider, "pointerup", 400, 2);
      expect(onChange).not.toHaveBeenCalled();
      penEvent(slider, endType, 400);
      penEvent(slider, "pointermove", 400);
      expect(onChange).not.toHaveBeenCalled();
      penEvent(slider, "pointerdown", 300, 3);
      expect(onChange).toHaveBeenLastCalledWith(5);
    },
  );

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
