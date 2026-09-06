import { timelineDurationSec } from "@/morph/model";
import { useEditorStore } from "@/store/editorStore";
import { hasMissingProjectVideos, useProjectStore } from "@/store/projectStore";
import { ensurePreviewEngine, getPreviewEngine } from "./previewEngineHost";
import { disposePreviewEngine } from "./previewEngineHost";
import { previewMediaIdentity, samePreviewMedia } from "./previewMediaIdentity";
import {
  beginPreviewSync,
  endPreviewSync,
  setPreviewSyncPhase,
} from "./previewSyncStatus";

/**
 * The single clock driver for the shared {@link PreviewEngine} (PRD M10 task #5).
 *
 * - **Playback**: hands the clock to the engine, which advances τ from a single
 *   wall-clock RAF loop. The engine writes τ back through `setTimelineTime` so
 *   the timeline playhead follows the presented shared textures.
 * - **Scrub / idle**: a coalesced exact sync seeks BOTH sides once and uploads,
 *   so the source/morph/target viewports update together.
 *
 * Idempotent: only the first caller starts the subscriptions.
 */
let started = false;
let playing = false;
let applyingEngineTau = false;
let syncing = false;
let pendingSync = false;
let playbackRequest = 0;
let predecodeGeneration = 0;

function duration(): number {
  return timelineDurationSec(useProjectStore.getState().project);
}

const onTau = (tauSec: number): void => {
  applyingEngineTau = true;
  useEditorStore.getState().setTimelineTime(tauSec, duration());
  applyingEngineTau = false;
};

async function startPlayback(tauSec: number): Promise<void> {
  if (hasMissingProjectVideos(useProjectStore.getState())) {
    useEditorStore.getState().setPlaying(false);
    return;
  }
  const request = ++playbackRequest;
  try {
    const engine = await ensurePreviewEngine();
    if (!engine || !playing || request !== playbackRequest) return;
    await engine.sync(tauSec, { realtime: true });
    if (
      !playing ||
      request !== playbackRequest ||
      engine !== getPreviewEngine()
    ) {
      return;
    }
    engine.play(tauSec, onTau);
  } catch {
    if (playing && request === playbackRequest) {
      useEditorStore.getState().setPlaying(false);
    }
  }
}

/** Idle pre-decode around τ after a settled scrub (M22) — never while playing;
 * a new τ (next scrubSync) or playback start cancels it via the generation. */
function schedulePredecode(): void {
  const generation = ++predecodeGeneration;
  const engine = getPreviewEngine();
  if (!engine || playing) return;
  void (async () => {
    try {
      await engine.predecodeAround(
        useEditorStore.getState().tauSec,
        () => generation === predecodeGeneration && !playing,
      );
    } catch {
      // Best-effort background work; a decode failure never surfaces.
    }
  })();
}

async function scrubSync(): Promise<void> {
  predecodeGeneration++; // clip edits invalidate idle decoding even at fixed τ
  if (syncing) {
    pendingSync = true;
    return;
  }
  syncing = true;
  beginPreviewSync("engine");
  try {
    const engine = await ensurePreviewEngine();
    setPreviewSyncPhase("frame");
    // A reader that opens after this sync should start the idle decode work
    // (proxy sweep) right away; while a sync is in flight its `finally`
    // schedules it anyway.
    engine?.setReaderReadyListener(() => {
      if (!playing && !syncing) schedulePredecode();
    });
    await engine?.sync(useEditorStore.getState().tauSec, { realtime: false });
  } catch {
    // Best-effort: a transient seek/upload failure must not wedge the driver.
  } finally {
    endPreviewSync();
    syncing = false;
    if (pendingSync) {
      pendingSync = false;
      void scrubSync();
    } else {
      schedulePredecode();
    }
  }
}

/** Forces a redraw of the current frame (used by viewports on mount/resize). */
export function requestPreviewSync(): void {
  if (playing) return; // the engine play loop already emits frames
  void scrubSync();
}

export function startPreviewDriver(): void {
  if (started) return;
  started = true;
  playing = useEditorStore.getState().playing;

  useEditorStore.subscribe((s, prev) => {
    if (s.playing !== prev.playing) {
      playing = s.playing;
      if (playing) {
        predecodeGeneration++; // no pre-decode during playback
        void startPlayback(s.tauSec);
      } else {
        playbackRequest++;
        getPreviewEngine()?.pause();
        void scrubSync();
      }
      return;
    }
    if (playing) {
      // A τ change while playing that the engine did not author is a user scrub:
      // restart playback from the new position.
      if (s.tauSec !== prev.tauSec && !applyingEngineTau) {
        getPreviewEngine()?.pause();
        void startPlayback(s.tauSec);
      }
      return;
    }
    if (s.tauSec !== prev.tauSec || s.t !== prev.t) void scrubSync();
  });

  useProjectStore.subscribe((s, prev) => {
    if (!s.project || !s.source || !s.target) {
      playbackRequest++;
      pendingSync = false;
      getPreviewEngine()?.pause();
      disposePreviewEngine();
      if (useEditorStore.getState().playing) {
        useEditorStore.getState().setPlaying(false);
      }
      return;
    }
    const mediaChanged = !samePreviewMedia(
      previewMediaIdentity(s),
      previewMediaIdentity(prev),
    );
    if (mediaChanged) {
      if (playing) void startPlayback(useEditorStore.getState().tauSec);
      else void scrubSync();
      return;
    }
    if (s.project !== prev.project) {
      // Refresh clip mapping without restarting the clock or losing caches.
      // Paused edits use the same coalesced seek path as playhead scrubbing.
      if (playing) void ensurePreviewEngine();
      else void scrubSync();
    }
  });

  if (playing) void startPlayback(useEditorStore.getState().tauSec);
  else void scrubSync();
}
