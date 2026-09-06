import { useNumberFormatter } from "@/i18n/formatters";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { timelineDurationSec } from "@/morph/model";
import {
  seekTimeline,
  toggleTimelinePlayback,
} from "@/morph/playback/timelineTransport";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/ui/focusRing";
import { useEditorStore } from "@/store/editorStore";
import { hasMissingProjectVideos, useProjectStore } from "@/store/projectStore";
import { usePenScrub } from "../usePenScrub";

/**
 * Compact transport for the mobile shell (PRD M12 lot 2): play/pause + a native
 * range scrubber (touch-friendly) + the morph progress readout. The heavy
 * per-layer timeline detail lives in the inspector sheet. τ flows through the
 * same store/preview driver as the desktop dock.
 */
export function MobileTimeline() {
  // `t` is taken by the morph parameter selected from the store below.
  const { t: translate } = useTranslation();
  const formatNumber = useNumberFormatter();
  const playing = useEditorStore((s) => s.playing);
  const tauSec = useEditorStore((s) => s.tauSec);
  const t = useEditorStore((s) => s.t);
  const project = useProjectStore((s) => s.project);
  const mediaMissing = useProjectStore(hasMissingProjectVideos);
  const durationSec = Math.max(0.001, timelineDurationSec(project));
  const scrub = usePenScrub(durationSec, seekTimeline);

  return (
    <div
      dir="ltr"
      data-technical-surface="timeline"
      className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-3 py-2"
    >
      <button
        type="button"
        aria-label={
          mediaMissing
            ? translate("timeline.videoMissing")
            : playing
              ? translate("timeline.pause")
              : translate("timeline.play")
        }
        title={mediaMissing ? translate("timeline.videoMissing") : undefined}
        onClick={toggleTimelinePlayback}
        disabled={mediaMissing}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40",
          FOCUS_RING,
        )}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={durationSec}
        step="any"
        value={Math.min(tauSec, durationSec)}
        {...scrub}
        aria-label={translate("timeline.position")}
        className="h-9 flex-1 cursor-pointer accent-accent"
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-primary">
        {formatNumber(t, 2)}
      </span>
    </div>
  );
}
