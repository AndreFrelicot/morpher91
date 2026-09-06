import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeWindowInput } from "./RangeWindowInput";

const setup = (start: number, end: number) => {
  const onChange = vi.fn();
  render(
    <RangeWindowInput
      start={start}
      end={end}
      onChange={onChange}
      startLabel="Window start"
      endLabel="Window end"
    />,
  );
  return {
    onChange,
    startInput: screen.getByLabelText("Window start"),
    endInput: screen.getByLabelText("Window end"),
  };
};

describe("RangeWindowInput", () => {
  it("shows the window bounds as percent on both handles", () => {
    const { startInput, endInput } = setup(0.3, 0.7);
    expect(startInput).toHaveValue("30");
    expect(endInput).toHaveValue("70");
  });

  it("reports a moved start handle in 0..1", () => {
    const { onChange, startInput } = setup(0.3, 0.7);
    fireEvent.change(startInput, { target: { value: "45" } });
    expect(onChange).toHaveBeenCalledWith({ start: 0.45, end: 0.7 });
  });

  it("clamps the start handle to the end handle", () => {
    const { onChange, startInput } = setup(0.3, 0.7);
    fireEvent.change(startInput, { target: { value: "90" } });
    expect(onChange).toHaveBeenCalledWith({ start: 0.7, end: 0.7 });
  });

  it("clamps the end handle to the start handle", () => {
    const { onChange, endInput } = setup(0.3, 0.7);
    fireEvent.change(endInput, { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith({ start: 0.3, end: 0.3 });
  });

  it("keeps the start handle reachable once the window sits on the right", () => {
    const { startInput, endInput } = setup(1, 1);
    expect(startInput.className).toContain("z-10");
    expect(endInput.className).not.toContain("z-10");
  });
});
