import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameContext } from "@/morph/playback/PreviewEngine";
import { emptyScene } from "@/morph/overlay/scene";
import { OverlayCanvas } from "./OverlayCanvas";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  unsubscribe: vi.fn(),
  subscribePreview: vi.fn(),
  startPreviewDriver: vi.fn(),
  listener: null as ((frame: FrameContext) => void) | null,
  presented: { t: 0, tauSec: 0 } as FrameContext,
}));

vi.mock("@/morph/gpu/GpuContext", () => ({
  configureContext: vi.fn(),
  createGpuContext: vi.fn(async () => ({
    context: {
      getCurrentTexture: () => ({ createView: () => ({}) }),
    },
    device: {},
    format: "rgba8unorm",
  })),
}));

vi.mock("@/morph/overlay/OverlayRenderer", () => ({
  OverlayRenderer: class {
    render = mocks.render;
    dispose = mocks.dispose;
  },
}));

vi.mock("@/morph/playback/previewEngineHost", () => ({
  getPresentedFrame: () => mocks.presented,
  subscribePreview: (listener: (frame: FrameContext) => void) => {
    mocks.listener = listener;
    mocks.subscribePreview(listener);
    return mocks.unsubscribe;
  },
}));

vi.mock("@/morph/playback/previewDriver", () => ({
  startPreviewDriver: mocks.startPreviewDriver,
}));

vi.mock("./overlay/resolveOverlayColors", () => ({
  resolveOverlayColors: () => ({}),
}));

describe("OverlayCanvas", () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  const flushAnimationFrame = () => {
    const pending = [...callbacks.entries()];
    callbacks.clear();
    for (const [, callback] of pending) callback(16);
  };

  beforeEach(() => {
    callbacks = new Map();
    nextFrame = 1;
    mocks.render.mockReset();
    mocks.dispose.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.subscribePreview.mockReset();
    mocks.startPreviewDriver.mockReset();
    mocks.listener = null;
    mocks.presented = { t: 0, tauSec: 0 };
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrame++;
        callbacks.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => callbacks.delete(id)),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("coalesces a preview notification and fresh React props into one draw", async () => {
    const firstBuild = vi.fn(() => emptyScene());
    const secondBuild = vi.fn(() => emptyScene());
    const initialFrame = {
      content: { x: 0, y: 0, width: 200, height: 100 },
      cssWidth: 200,
      cssHeight: 100,
    };
    const view = render(
      <OverlayCanvas frame={initialFrame} build={firstBuild} />,
    );
    await act(async () => Promise.resolve());
    act(flushAnimationFrame);

    expect(mocks.render).toHaveBeenCalledOnce();
    expect(firstBuild).toHaveBeenCalledWith({}, { t: 0, tauSec: 0 });

    const presented = { t: 0.5, tauSec: 2 };
    mocks.presented = presented;
    act(() => mocks.listener?.(presented));
    view.rerender(
      <OverlayCanvas
        frame={{ ...initialFrame, cssWidth: 220 }}
        build={secondBuild}
      />,
    );
    act(flushAnimationFrame);

    expect(mocks.render).toHaveBeenCalledTimes(2);
    expect(secondBuild).toHaveBeenCalledOnce();
    expect(secondBuild).toHaveBeenCalledWith({}, presented);
  });

  it("cancels pending work and unsubscribes on unmount", async () => {
    const view = render(
      <OverlayCanvas
        frame={{
          content: { x: 0, y: 0, width: 200, height: 100 },
          cssWidth: 200,
          cssHeight: 100,
        }}
        build={() => emptyScene()}
      />,
    );
    await act(async () => Promise.resolve());
    act(flushAnimationFrame);
    act(() => mocks.listener?.({ t: 0.25, tauSec: 1 }));

    view.unmount();
    act(flushAnimationFrame);

    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });
});
