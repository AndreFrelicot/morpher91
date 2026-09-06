import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { assist } from "@/assist/anchors";
import {
  ACTION_ARIA_SHORTCUTS,
  ACTION_SHORTCUT_LABELS,
} from "@/features/editor/useKeyboardShortcuts";
import { buildRulerTicks, clamp, formatTimecode, pct } from "./timelineFormat";
import { usePenScrub } from "./usePenScrub";

/**
 * Scrubbable ruler: ticks, timecodes on the major ones, and the playhead.
 * The `compact` variant (24 px, no assist anchor) takes the place of the
 * timeline dock's progress bar when the dock is collapsed — in zen mode above
 * all — so playback position stays readable and draggable (M24 lot 4).
 */
export function PlaybackRuler({
  durationSec,
  fps,
  tauSec,
  onChange,
  compact = false,
}: {
  durationSec: number;
  fps: number;
  tauSec: number;
  onChange: (sec: number) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const safeDurationSec = Math.max(0.001, durationSec);
  const ticks = useMemo(
    () => buildRulerTicks(safeDurationSec),
    [safeDurationSec],
  );
  const currentSec = clamp(tauSec, 0, safeDurationSec);
  const scrub = usePenScrub(safeDurationSec, onChange);

  return (
    <div
      className={
        compact
          ? "relative h-6 min-w-8 flex-1 rounded bg-muted/40"
          : "relative h-8 rounded bg-muted/40"
      }
      {...(compact ? {} : assist("timeline.ruler"))}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 ${
          compact ? "h-5" : "h-6"
        }`}
      >
        {ticks.map((tick, index) => (
          <div
            key={`${tick.sec}-${index}`}
            className="absolute bottom-0 flex -translate-x-px flex-col items-center"
            style={{ left: pct(tick.sec, safeDurationSec) }}
          >
            {tick.major && (
              <span className="mb-0.5 translate-x-1 font-mono text-[9px] leading-none text-muted-foreground">
                {formatTimecode(tick.sec, fps)}
              </span>
            )}
            <span
              className={`block w-px bg-muted-foreground/60 ${
                tick.major ? (compact ? "h-2" : "h-3") : "h-1.5"
              }`}
            />
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary"
        style={{ left: pct(currentSec, safeDurationSec) }}
      >
        <span className="absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-primary" />
      </div>
      <input
        type="range"
        min={0}
        max={safeDurationSec}
        step="any"
        value={currentSec}
        {...scrub}
        aria-label={t("timeline.position")}
        aria-keyshortcuts={ACTION_ARIA_SHORTCUTS.timelinePosition}
        title={`${t("timeline.position")} (${ACTION_SHORTCUT_LABELS.timelineStepBack}/${ACTION_SHORTCUT_LABELS.timelineStepForward}, ${ACTION_SHORTCUT_LABELS.timelineStart}/${ACTION_SHORTCUT_LABELS.timelineEnd})`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
