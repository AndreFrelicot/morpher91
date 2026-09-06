import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editorStore";
import { useViewportGestures } from "./useViewportGestures";

const capture = vi.fn();
const release = vi.fn();
const captured = new Set<number>();
const element = {
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
  setPointerCapture: (id: number) => {
    captured.add(id);
    capture(id);
  },
  hasPointerCapture: (id: number) => captured.has(id),
  releasePointerCapture: (id: number) => {
    captured.delete(id);
    release(id);
  },
} as unknown as HTMLDivElement;

function pointer(
  pointerId: number,
  clientX: number,
  clientY: number,
  pointerType = "touch",
): React.PointerEvent<HTMLDivElement> {
  return {
    pointerId,
    clientX,
    clientY,
    pointerType,
    currentTarget: element,
    target: element,
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

beforeEach(() => {
  captured.clear();
  capture.mockClear();
  release.mockClear();
  useEditorStore.setState({
    viewportsLinked: false,
    viewports: {
      source: { zoom: 1, pan: { x: 0, y: 0 } },
      preview: { zoom: 1, pan: { x: 0, y: 0 } },
      target: { zoom: 1, pan: { x: 0, y: 0 } },
    },
  });
});

describe("useViewportGestures", () => {
  it("forwards a single primary pointer and releases capture", () => {
    const down = vi.fn();
    const move = vi.fn();
    const end = vi.fn();
    const { result } = renderHook(() =>
      useViewportGestures<HTMLDivElement>({
        slot: "preview",
        getSize: () => ({ width: 200, height: 100 }),
        getAspect: () => 2,
        onPrimaryDown: down,
        onPrimaryMove: move,
        onPrimaryEnd: end,
      }),
    );
    const start = pointer(1, 20, 30, "mouse");
    const moved = pointer(1, 40, 50, "mouse");

    act(() => result.current.onPointerDown(start));
    act(() => result.current.onPointerMove(moved));
    act(() => result.current.onPointerUp(moved));

    expect(down).toHaveBeenCalledWith(start, { x: 20, y: 30 });
    expect(move).toHaveBeenCalledWith(moved, { x: 40, y: 50 });
    expect(end).toHaveBeenCalledWith(moved, { x: 40, y: 50 }, false);
    expect(capture).toHaveBeenCalledWith(1);
    expect(release).toHaveBeenCalledWith(1);
  });

  it("switches two pointers to pinch and handles partial release", () => {
    const pinchStart = vi.fn();
    const pinchEnd = vi.fn();
    const primaryMove = vi.fn();
    const { result } = renderHook(() =>
      useViewportGestures<HTMLDivElement>({
        slot: "preview",
        getSize: () => ({ width: 200, height: 100 }),
        getAspect: () => 2,
        onPrimaryMove: primaryMove,
        onPinchStart: pinchStart,
        onPinchEnd: pinchEnd,
      }),
    );

    act(() => result.current.onPointerDown(pointer(1, 80, 50)));
    act(() => result.current.onPointerDown(pointer(2, 120, 50)));
    act(() => result.current.onPointerMove(pointer(1, 60, 50)));
    expect(useEditorStore.getState().viewports.preview.zoom).toBeCloseTo(1.5);

    act(() => result.current.onPointerUp(pointer(1, 60, 50)));
    act(() => result.current.onPointerMove(pointer(2, 130, 50)));

    expect(pinchStart).toHaveBeenCalledTimes(1);
    expect(pinchEnd).toHaveBeenCalledTimes(1);
    expect(primaryMove).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(1);
  });

  it("zooms on wheel and resets after a double pointer-up", () => {
    const { result } = renderHook(() =>
      useViewportGestures<HTMLDivElement>({
        slot: "preview",
        getSize: () => ({ width: 200, height: 100 }),
        getAspect: () => 2,
      }),
    );
    act(() =>
      result.current.onWheel({
        deltaY: -100,
        deltaMode: 0,
        ctrlKey: false,
        currentTarget: element,
        target: element,
      } as unknown as React.WheelEvent<HTMLDivElement>),
    );
    // One mouse-wheel notch (~100px) zooms by exp(0.22) (delta-proportional).
    expect(useEditorStore.getState().viewports.preview.zoom).toBeCloseTo(
      Math.exp(0.22),
    );
    useEditorStore.getState().setViewport("preview", {
      zoom: 2,
      pan: { x: 10, y: 20 },
    });

    for (let index = 0; index < 2; index++) {
      act(() => result.current.onPointerDown(pointer(index + 1, 50, 50)));
      act(() => result.current.onPointerUp(pointer(index + 1, 50, 50)));
    }

    expect(useEditorStore.getState().viewports.preview).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 },
    });
  });
});
