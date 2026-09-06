import { useEffect, useState } from "react";
import type { FrameContext } from "./PreviewEngine";
import { getPresentedFrame, subscribePreview } from "./previewEngineHost";
import { startPreviewDriver } from "./previewDriver";

/**
 * Reactive view of {@link getPresentedFrame}: the τ/t of the last frame the shared
 * PreviewEngine decoded + uploaded (PRD M10/M11). Components use this instead of
 * the live store τ for time-derived rendering so feature overlays and the morph
 * warp stay locked to the on-screen video frame while scrubbing — the timeline
 * playhead (store τ) can run ahead of the texture, the rendered geometry does not.
 */
export function usePresentedFrame(): FrameContext {
  const [frame, setFrame] = useState<FrameContext>(getPresentedFrame);
  useEffect(() => {
    startPreviewDriver();
    // Frames are notified at pointer-event rate during a scrub; coalesce the
    // React state update to one per browser frame (last presented frame wins).
    let animationFrame: number | null = null;
    const onFrame = () => {
      if (animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        setFrame(getPresentedFrame());
      });
    };
    const unsubscribe = subscribePreview(onFrame);
    // Pick up a frame presented between the initial render and this effect
    // (setFrame bails out when the presented frame has not changed).
    onFrame();
    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      unsubscribe();
    };
  }, []);
  return frame;
}
