import { dialogStyles } from "@/ui/components/dialogStyles";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/components/ui/button";
import { getGuide } from "./guides";
import type { L } from "./guides";
import { startAssistEngine, useAssistStore } from "./assistStore";

const POPOVER_WIDTH = 336;
const MARGIN = 12;
const GAP = 10;

function pick(l: L | ((language: string) => string), lang: string): string {
  if (typeof l === "function") return l(lang);
  return i18n.getFixedT(lang)(l);
}

const sameRect = (a: DOMRect | null, b: DOMRect | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * Guided-assistant overlay (M16): halo + popover following the current step's
 * `[data-assist]` anchor. Never blocks interaction — the container is
 * pointer-events-none, only the popover itself is interactive.
 */
export function AssistantOverlay() {
  const { t, i18n } = useTranslation();
  const activeGuideId = useAssistStore((s) => s.activeGuideId);
  const stepIndex = useAssistStore((s) => s.stepIndex);
  const stepSatisfied = useAssistStore((s) => s.stepSatisfied);
  const next = useAssistStore((s) => s.next);
  const back = useAssistStore((s) => s.back);
  const quit = useAssistStore((s) => s.quit);

  const guide = activeGuideId ? getGuide(activeGuideId) : null;
  const step = guide?.steps[stepIndex] ?? null;

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverHeight, setPopoverHeight] = useState(180);

  useEffect(() => {
    startAssistEngine();
  }, []);

  // Follow the anchored element: elements mount/unmount and move (resize,
  // scroll, accordion), so re-query and re-measure every active frame.
  useEffect(() => {
    // No cleanup reset needed: with no step the component renders nothing,
    // and the next step's first frame overwrites the stale rect.
    if (!step) return;
    let raf = 0;
    // Anchors below a panel's scroll fold would put both the highlight and the
    // popover off-screen: reveal the element once, the first frame it exists.
    let revealed = false;
    const tick = () => {
      const el = step.anchor
        ? document.querySelector(`[data-assist="${step.anchor}"]`)
        : null;
      if (el && !revealed) {
        revealed = true;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const nextRect = el ? el.getBoundingClientRect() : null;
      setRect((prev) => (sameRect(prev, nextRect) ? prev : nextRect));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPopoverHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  if (!guide || !step) return null;

  const lang = i18n.language;
  const anchorMissing = step.anchor !== null && rect === null;
  const isLast = stepIndex === guide.steps.length - 1;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const popoverWidth = Math.min(POPOVER_WIDTH, vw - 2 * MARGIN);
  let popLeft: number;
  let popTop: number;
  if (rect) {
    popLeft = clamp(
      rect.left + rect.width / 2 - popoverWidth / 2,
      MARGIN,
      vw - popoverWidth - MARGIN,
    );
    popTop = rect.bottom + GAP;
    if (popTop + popoverHeight > vh - MARGIN) {
      popTop = Math.max(MARGIN, rect.top - popoverHeight - GAP);
    }
  } else {
    popLeft = (vw - popoverWidth) / 2;
    popTop = Math.max(MARGIN, (vh - popoverHeight) / 2);
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      {rect && (
        <div
          className={cn(
            "absolute rounded-md border-2 transition-all duration-150 motion-reduce:transition-none",
            stepSatisfied ? "border-primary" : "border-selection",
          )}
          style={{
            left: rect.left - 5,
            top: rect.top - 5,
            width: rect.width + 10,
            height: rect.height + 10,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.35)",
          }}
        />
      )}

      <div
        ref={popoverRef}
        role="dialog"
        data-assist-popover=""
        aria-label={pick(guide.title, lang)}
        className={cn(
          dialogStyles.surface,
          "pointer-events-auto absolute max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4 transition-[left,top] duration-150 motion-reduce:transition-none",
        )}
        style={{ left: popLeft, top: popTop, width: popoverWidth }}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <p className="text-base font-semibold leading-6">
            {pick(step.title, lang)}
          </p>
          <button
            type="button"
            aria-label={t("assist.quit")}
            onClick={quit}
            className={dialogStyles.close}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {anchorMissing && step.missingHint
            ? pick(step.missingHint, lang)
            : pick(step.body, lang)}
        </p>
        {anchorMissing && !step.missingHint && (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            {t("assist.anchorMissing")}
          </p>
        )}

        {stepSatisfied && (
          <p
            role="status"
            className="mt-3 flex items-start gap-1.5 text-xs text-primary"
          >
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("assist.stepSatisfied")}
          </p>
        )}

        <div className="mt-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStepsOpen((o) => !o)}
            aria-expanded={stepsOpen}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("assist.step", {
              current: stepIndex + 1,
              total: guide.steps.length,
            })}
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                stepsOpen && "rotate-180",
              )}
            />
          </button>
          <span className="flex-1" />
          {step.navigate && anchorMissing && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => step.navigate?.()}
            >
              {t("assist.showMe")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            disabled={stepIndex === 0}
            onClick={back}
          >
            {t("assist.back")}
          </Button>
          <Button variant="secondary" size="xs" onClick={next}>
            {isLast ? t("assist.done") : t("assist.next")}
          </Button>
        </div>

        {stepsOpen && (
          <ol className="mt-2 space-y-0.5 border-t border-border pt-2">
            {guide.steps.map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  i === stepIndex
                    ? "text-foreground"
                    : "text-muted-foreground/70",
                )}
              >
                {i < stepIndex ? (
                  <Check className="size-3 text-primary" />
                ) : i === stepIndex ? (
                  <span className="w-3 text-center leading-none">▸</span>
                ) : (
                  <span className="w-3" />
                )}
                <span className="truncate">{pick(s.title, lang)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
