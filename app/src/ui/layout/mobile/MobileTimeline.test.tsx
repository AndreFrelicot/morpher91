import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  defaultVideoTimeline,
  type ImageAsset,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { MobileTimeline } from "./MobileTimeline";

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 640,
  height: 480,
  source: { kind: "external-file-placeholder", value: name },
  placement: defaultPlacement(),
});

beforeEach(() => {
  const project = createProject(image("video.mov"), image("target.png"));
  project.videos = {
    source: {
      id: "video",
      name: "video.mov",
      width: 640,
      height: 480,
      durationSec: 4,
      source: { kind: "external-video-placeholder", value: "video.mov" },
      timeline: defaultVideoTimeline(4),
    },
  };
  useProjectStore.setState({
    source: null,
    target: null,
    sourceVideo: null,
    targetVideo: null,
    project,
  });
  useEditorStore.setState({ playing: false, tauSec: 0, t: 0 });
});

describe("MobileTimeline missing videos", () => {
  it.each(["pen", "touch"])(
    "seeks immediately and continuously with %s even when playback is unavailable",
    (pointerType) => {
      render(<MobileTimeline />);
      const slider = screen.getByRole("slider");
      slider.setPointerCapture = vi.fn();
      slider.hasPointerCapture = () => true;
      slider.releasePointerCapture = vi.fn();
      vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        width: 200,
      } as DOMRect);
      const pointer = (type: string, x: number) => {
        const event = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          button: 0,
        });
        Object.defineProperties(event, {
          pointerId: { value: 1 },
          pointerType: { value: pointerType },
        });
        fireEvent(slider, event);
      };
      pointer("pointerdown", 150);
      expect(useEditorStore.getState().tauSec).toBe(3);
      pointer("pointermove", 50);
      expect(useEditorStore.getState().tauSec).toBe(1);
      expect(slider).toHaveValue("1");
      pointer("pointerup", 100);
      expect(useEditorStore.getState().tauSec).toBe(2);
      expect(slider.releasePointerCapture).toHaveBeenCalledWith(1);
    },
  );

  it("disables playback and explains why", () => {
    render(<MobileTimeline />);
    expect(
      screen.getByRole("button", {
        name: "Relink the missing video files before playback.",
      }),
    ).toBeDisabled();
  });
});
