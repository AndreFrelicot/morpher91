/**
 * Double-handle 0..1 window built from two stacked native range inputs, so
 * keyboard support, focus rings and touch behaviour come for free (no slider
 * primitive nor extra dependency). The visible track and window are drawn
 * behind them — see `.range-window` in globals.css.
 */
export function RangeWindowInput({
  start,
  end,
  onChange,
  startLabel,
  endLabel,
  disabled = false,
}: {
  /** Window bounds in 0..1. */
  start: number;
  end: number;
  /** Called with the constrained window (`start ≤ end`). */
  onChange: (window: { start: number; end: number }) => void;
  startLabel: string;
  endLabel: string;
  disabled?: boolean;
}) {
  const startPercent = toPercent(start);
  const endPercent = toPercent(end);
  // Once the window sits in the right half, the start handle goes on top so it
  // stays grabbable when both handles land on 100%.
  const startOnTop = startPercent > 50;

  return (
    <div dir="ltr" className="range-window relative h-3.5 w-full">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/15" />
      <div
        className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
        style={{
          left: `${startPercent}%`,
          width: `${Math.max(0, endPercent - startPercent)}%`,
        }}
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={startPercent}
        disabled={disabled}
        aria-label={startLabel}
        className={startOnTop ? "z-10" : undefined}
        onChange={(event) =>
          onChange({
            start: fromPercent(
              Math.min(Number(event.target.value), endPercent),
            ),
            end,
          })
        }
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={endPercent}
        disabled={disabled}
        aria-label={endLabel}
        className={startOnTop ? undefined : "z-10"}
        onChange={(event) =>
          onChange({
            start,
            end: fromPercent(
              Math.max(Number(event.target.value), startPercent),
            ),
          })
        }
      />
    </div>
  );
}

const toPercent = (value: number) =>
  Math.min(100, Math.max(0, Math.round((value || 0) * 100)));

const fromPercent = (percent: number) =>
  Math.min(1, Math.max(0, percent / 100));
