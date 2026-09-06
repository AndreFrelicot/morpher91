import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BezierEasing } from "@/morph/model";
import { BezierEditor } from "./BezierEditor";

const VIEW = 140;
const PAD = 20;

/** jsdom does no layout: pretend the 140-unit viewBox is a 140px square at (0,0). */
const stubLayout = () =>
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: VIEW,
    bottom: VIEW,
    width: VIEW,
    height: VIEW,
    toJSON: () => ({}),
  } as DOMRect);

/** Client coordinates of a point in curve space (0..1, y up). */
const clientAt = (x: number, y: number) => ({
  clientX: PAD + x * 100,
  clientY: PAD + (1 - y) * 100,
});

const setup = (value: BezierEasing) => {
  const onChange = vi.fn();
  render(
    <BezierEditor
      value={value}
      onChange={onChange}
      label="Easing curve"
      handleLabels={["Handle 1", "Handle 2"]}
    />,
  );
  return { onChange };
};

const linear: BezierEasing = { kind: "bezier", x1: 0, y1: 0, x2: 1, y2: 1 };

afterEach(() => vi.restoreAllMocks());

describe("BezierEditor", () => {
  it("draws the curve between (0,0) and (1,1)", () => {
    setup({ kind: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
    const curve = screen
      .getByLabelText("Easing curve")
      .querySelector("path[d]");
    expect(curve?.getAttribute("d")).toBe("M 0 100 C 25 90, 25 0, 100 0");
  });

  it("updates the first handle from a drag", () => {
    stubLayout();
    const { onChange } = setup(linear);

    fireEvent.pointerDown(screen.getByLabelText("Handle 1"), {
      pointerId: 1,
      ...clientAt(0.4, 0.7),
    });

    expect(onChange).toHaveBeenCalledWith({
      kind: "bezier",
      x1: 0.4,
      y1: 0.7,
      x2: 1,
      y2: 1,
    });
  });

  it("updates the second handle while the pointer is down", () => {
    stubLayout();
    const { onChange } = setup(linear);
    const handle = screen.getByLabelText("Handle 2");

    fireEvent.pointerMove(handle, { buttons: 0, ...clientAt(0.2, 0.2) });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerMove(handle, { buttons: 1, ...clientAt(0.2, 0.2) });
    const next = onChange.mock.calls[0][0];
    expect(next.x2).toBeCloseTo(0.2);
    expect(next.y2).toBeCloseTo(0.2);
    expect(next).toMatchObject({ kind: "bezier", x1: 0, y1: 0 });
  });

  it("clamps a handle dragged outside the box to 0..1", () => {
    stubLayout();
    const { onChange } = setup(linear);

    fireEvent.pointerDown(screen.getByLabelText("Handle 1"), {
      pointerId: 1,
      ...clientAt(-0.5, 1.8),
    });

    expect(onChange).toHaveBeenCalledWith({
      kind: "bezier",
      x1: 0,
      y1: 1,
      x2: 1,
      y2: 1,
    });
  });
});
