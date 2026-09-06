import { useNumberFormatter } from "@/i18n/formatters";
import { useTranslation } from "react-i18next";
import { usePreviewSyncStatus } from "@/morph/playback/previewSyncStatus";

/** Threshold above which a finished sync is reported as slow. */
const SLOW_SYNC_MS = 500;

/**
 * Shows when the preview engine is still working on the last scrub (seek,
 * decode, engine build) so a stale viewport reads as "waiting" rather than
 * "frozen", and keeps the duration of the last slow sync visible afterwards.
 */
export function PreviewSyncIndicator() {
  const { t } = useTranslation();
  const formatNumber = useNumberFormatter();
  const formatSeconds = (ms: number) => `${formatNumber(ms / 1000, 1)} s`;
  const { waitingMs, phase, lastDurationMs } = usePreviewSyncStatus();

  if (waitingMs !== null) {
    const phaseLabel = t(
      phase === "engine"
        ? "timeline.syncPhaseEngine"
        : "timeline.syncPhaseFrame",
    );
    return (
      <span
        role="status"
        title={t("timeline.syncWaitingTitle", { phase: phaseLabel })}
        className="flex items-center gap-1.5 text-xs text-amber-400"
      >
        <span className="size-3 rounded-full border-2 border-amber-400/30 border-t-amber-400 motion-safe:animate-spin" />
        {t("timeline.syncWaiting", { elapsed: formatSeconds(waitingMs) })}
      </span>
    );
  }

  if (lastDurationMs !== null && lastDurationMs >= SLOW_SYNC_MS) {
    return (
      <span
        title={t("timeline.syncLastTitle")}
        className="text-xs text-muted-foreground"
      >
        {t("timeline.syncLast", { elapsed: formatSeconds(lastDurationMs) })}
      </span>
    );
  }

  return null;
}
