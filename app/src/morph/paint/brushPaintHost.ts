import { getSharedGpu } from "@/morph/gpu/sharedDevice";
import {
  decodeMaskBytes,
  encodeMaskBytes,
  GLOBAL_LAYER_ID,
  maskBytesAreEmpty,
  paintedMaskSize,
  type LayerId,
  type PaintedMask,
  type Vec2,
} from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { useProjectStore } from "@/store/projectStore";
import { BrushEngine, type BrushStrokeParams } from "./BrushEngine";

/**
 * Shared-device {@link BrushEngine} host (PRD M11 lot 3), mirroring the
 * previewEngineHost pattern: the BrushTool and the pane tint component talk to
 * one engine session that is kept in sync with the ACTIVE layer's stored
 * `paintedMask`. A finished stroke is read back and committed to the project
 * document (so save/export/preview all read the mask from the model); an
 * all-zero mask is dropped rather than serialized.
 */
let engine: BrushEngine | null = null;
let pending: Promise<BrushEngine | null> | null = null;
const listeners = new Set<() => void>();
let syncedBase: {
  layerId: LayerId;
  painted: PaintedMask | undefined;
} | null = null;
let engineGeneration = 0;

const notify = () => listeners.forEach((cb) => cb());

export async function ensureBrushEngine(): Promise<BrushEngine | null> {
  if (engine) return engine;
  if (pending) return pending;
  const generation = ++engineGeneration;
  pending = getSharedGpu()
    .then((gpu) => {
      if (generation !== engineGeneration) return null;
      engine = new BrushEngine(gpu.device, notify);
      return engine;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Drops the active authoring session and invalidates an in-flight GPU build. */
export function disposeBrushEngine(): void {
  engineGeneration++;
  engine?.cancelStroke();
  engine?.dispose();
  engine = null;
  syncedBase = null;
  notify();
}

/** Reset and disposal are intentionally equivalent: masks live in the model. */
export function resetBrushEngine(): void {
  disposeBrushEngine();
}

export function getBrushEngine(): BrushEngine | null {
  return engine;
}

/** Notifies on every visual change of the brush session (live stroke, base). */
export function subscribeBrush(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Active user layer (the brush never paints the Global base layer). */
function activeUserLayer() {
  const project = useProjectStore.getState().project;
  const layerId = useEditorStore.getState().activeLayerId;
  if (!project || layerId === GLOBAL_LAYER_ID) return null;
  const layer = project.layers.find((l) => l.id === layerId);
  return layer ? { project, layer } : null;
}

/**
 * Loads the active layer's stored mask into the engine session (no-op when
 * already in sync, mid-stroke, or when the engine is not created yet).
 */
export function syncBrushBase(): void {
  if (!engine || engine.strokeInProgress()) return;
  const active = activeUserLayer();
  if (!active) return;
  const { project, layer } = active;
  if (
    syncedBase &&
    syncedBase.layerId === layer.id &&
    syncedBase.painted === layer.paintedMask &&
    engine.baseLayerId() === layer.id
  ) {
    return;
  }

  const painted = layer.paintedMask;
  const size = painted
    ? { width: painted.width, height: painted.height }
    : paintedMaskSize(project.canvas);
  let bytes: Uint8Array | null = null;
  if (painted) {
    try {
      bytes = decodeMaskBytes(painted.data, painted.width * painted.height);
    } catch {
      bytes = null; // corrupt mask in a loaded project → start blank
    }
  }
  engine.setBase(layer.id, size.width, size.height, bytes);
  syncedBase = { layerId: layer.id, painted };
}

/**
 * Starts a stroke with the store's brush settings, optionally overridden for
 * this stroke only (e.g. Alt/Option-drag forces the eraser). False when not
 * paintable.
 */
export function beginBrushStroke(
  overrides?: Partial<BrushStrokeParams>,
): boolean {
  if (!engine) {
    void ensureBrushEngine(); // warm up for the next attempt
    return false;
  }
  if (!activeUserLayer()) return false;
  syncBrushBase();
  return engine.beginStroke({
    ...useEditorStore.getState().brush,
    ...overrides,
  });
}

export function extendBrushStroke(points: Vec2[]): void {
  engine?.extendStroke(points);
}

export function cancelBrushStroke(): void {
  engine?.cancelStroke();
}

/** Ends the stroke and writes the merged mask into the layer document. */
export async function commitBrushStroke(): Promise<void> {
  if (!engine) return;
  const result = await engine.endStroke();
  if (!result) return;
  const paintedMask = maskBytesAreEmpty(result.bytes)
    ? undefined
    : {
        width: result.width,
        height: result.height,
        data: encodeMaskBytes(result.bytes),
      };
  useProjectStore.getState().updateLayer(result.layerId, { paintedMask });
  syncedBase = { layerId: result.layerId, painted: paintedMask };
}

/**
 * Live mask view for a layer while the brush session mirrors it: the engine's
 * display texture during a stroke (immediate feedback for the composite
 * preview), or between strokes when the session base matches the layer's
 * stored mask. Null when the stored mask is the source of truth.
 */
export function liveBrushMaskView(layerId: LayerId): GPUTextureView | null {
  if (!engine || engine.baseLayerId() !== layerId) return null;
  if (engine.strokeInProgress()) return engine.maskView();
  const project = useProjectStore.getState().project;
  const layer = project?.layers.find((l) => l.id === layerId);
  if (!layer?.paintedMask) return null;
  if (
    syncedBase &&
    syncedBase.layerId === layerId &&
    syncedBase.painted === layer.paintedMask
  ) {
    return engine.maskView();
  }
  return null;
}
