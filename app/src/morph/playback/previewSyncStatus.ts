import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Observable "is the preview engine still working on the last scrub?" state.
 *
 * The driver marks a sync as pending when a scrub starts and clears it when
 * the frame has been presented (or the sync failed). The UI shows an indicator
 * once the wait exceeds a short grace period, so a slow seek / decode / engine
 * build is visible instead of looking like a frozen viewport.
 */
export type PreviewSyncPhase = "engine" | "frame";

export type PreviewSyncStatus = {
  /** `performance.now()` when the pending sync started, or null when idle. */
  pendingSince: number | null;
  /** What the pending sync is waiting on. */
  phase: PreviewSyncPhase | null;
  /** Wall-clock duration of the last completed sync, in ms. */
  lastDurationMs: number | null;
};

let status: PreviewSyncStatus = {
  pendingSince: null,
  phase: null,
  lastDurationMs: null,
};
const listeners = new Set<() => void>();

function publish(next: PreviewSyncStatus): void {
  status = next;
  listeners.forEach((listener) => listener());
}

export function getPreviewSyncStatus(): PreviewSyncStatus {
  return status;
}

export function subscribePreviewSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginPreviewSync(phase: PreviewSyncPhase): void {
  publish({ ...status, pendingSince: performance.now(), phase });
}

export function setPreviewSyncPhase(phase: PreviewSyncPhase): void {
  if (status.pendingSince === null || status.phase === phase) return;
  publish({ ...status, phase });
}

export function endPreviewSync(): void {
  if (status.pendingSince === null) return;
  publish({
    pendingSince: null,
    phase: null,
    lastDurationMs: performance.now() - status.pendingSince,
  });
}

/** Grace period before a pending sync is reported as a visible wait. */
export const PREVIEW_SYNC_GRACE_MS = 250;

/**
 * Reactive view of the sync status. While a sync is pending past the grace
 * period, `waitingMs` ticks up so the UI can display the elapsed wait.
 */
export function usePreviewSyncStatus(): PreviewSyncStatus & {
  waitingMs: number | null;
} {
  const snapshot = useSyncExternalStore(
    subscribePreviewSyncStatus,
    getPreviewSyncStatus,
  );
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (snapshot.pendingSince === null) return;
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [snapshot.pendingSince]);

  const elapsed =
    snapshot.pendingSince === null ? null : now - snapshot.pendingSince;
  const waitingMs =
    elapsed !== null && elapsed >= PREVIEW_SYNC_GRACE_MS ? elapsed : null;
  return { ...snapshot, waitingMs };
}
