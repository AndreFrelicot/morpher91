import { getSharedGpu } from "@/morph/gpu/sharedDevice";
import { hasMissingProjectVideos, useProjectStore } from "@/store/projectStore";
import {
  PreviewEngine,
  type FrameContext,
  type FrameListener,
} from "./PreviewEngine";
import type { SourceInput } from "./VideoSource";
import { previewMediaIdentity, samePreviewMedia } from "./previewMediaIdentity";

/**
 * App-wide singleton {@link PreviewEngine}, bound to the current project. It is
 * rebuilt when the loaded source/target image or video identity changes, and its
 * project reference is refreshed on every other store change (feature/timeline
 * edits). Viewport components call {@link ensurePreviewEngine} from an effect and
 * {@link subscribePreview} to redraw on each synced frame — the subscription
 * lives on the host, so it survives engine rebuilds.
 */
let engine: PreviewEngine | null = null;
let key: unknown[] = [];
let building: Promise<PreviewEngine | null> | null = null;
let engineGeneration = 0;
const listeners = new Set<FrameListener>();
let presented: FrameContext = { tauSec: 0, t: 0 };

/** Subscribe to synced frames across engine rebuilds (stable indirection). */
export function subscribePreview(listener: FrameListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The τ/t of the LAST frame the engine actually decoded + uploaded (PRD M10/M11).
 * Time-derived rendering (morph warp, overlays) should read THIS — not the live
 * store τ — so geometry stays locked to the presented video frame while scrubbing
 * (the seek/decode is async, so the store τ runs ahead of the texture).
 */
export function getPresentedFrame(): FrameContext {
  return presented;
}

type EngineInputs = {
  source: SourceInput;
  target: SourceInput;
  project: NonNullable<ReturnType<typeof useProjectStore.getState>["project"]>;
  key: unknown[];
};

function currentInputs(): EngineInputs | null {
  const state = useProjectStore.getState();
  if (
    !state.source ||
    !state.target ||
    !state.project ||
    hasMissingProjectVideos(state)
  ) {
    return null;
  }
  return {
    source: { bitmap: state.source.bitmap, video: state.sourceVideo },
    target: { bitmap: state.target.bitmap, video: state.targetVideo },
    project: state.project,
    key: previewMediaIdentity(state),
  };
}

export async function ensurePreviewEngine(): Promise<PreviewEngine | null> {
  if (building) await building;

  const inputs = currentInputs();
  if (!inputs) {
    disposePreviewEngine();
    return null;
  }
  if (engine && samePreviewMedia(key, inputs.key)) {
    engine.setProject(inputs.project);
    return engine;
  }

  const generation = ++engineGeneration;
  building = (async () => {
    const fresh = currentInputs();
    if (!fresh) {
      disposePreviewEngine();
      return null;
    }
    const { device } = await getSharedGpu();
    if (generation !== engineGeneration) return null;
    const latest = currentInputs();
    if (!latest || !samePreviewMedia(latest.key, fresh.key)) return null;
    destroyPreviewEngine();
    engine = new PreviewEngine(
      device,
      latest.source,
      latest.target,
      latest.project,
    );
    // Forward this engine's frames to the host listeners, which persist across
    // rebuilds so viewports never need to re-subscribe. Record the presented
    // frame first so getPresentedFrame() is fresh inside the listeners.
    engine.subscribe((frame) => {
      presented = frame;
      for (const listener of listeners) listener(frame);
    });
    key = latest.key;
    return engine;
  })();

  try {
    return await building;
  } finally {
    building = null;
  }
}

export function getPreviewEngine(): PreviewEngine | null {
  return engine;
}

export function disposePreviewEngine(): void {
  engineGeneration++;
  destroyPreviewEngine();
}

function destroyPreviewEngine(): void {
  engine?.dispose();
  engine = null;
  key = [];
  presented = { tauSec: 0, t: 0 };
}
