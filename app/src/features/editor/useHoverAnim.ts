import { useCallback, useEffect, useRef, useState } from "react";
import type { BeaconBurst } from "@/store/editorStore";

/** Exponential-smoothing time constant (ms): ~120 ms to visually settle. */
const TAU_MS = 45;
const EPS = 0.001;
/** Hover beacon loop period (ms). */
const PULSE_MS = 1100;
/** One-shot burst duration (ms), e.g. after closing a polygon. */
const BURST_MS = 550;

/**
 * Eased per-feature hover emphasis (PRD M11 lot 2) plus the shared overlay
 * animation clock. Returns a stable `emphasisFor(id) → 0..1` that rises toward 1
 * while a feature is hovered and decays to 0 afterwards, a looping `pulse`
 * phase (0..1) that runs while something is hovered (beacon rings), the
 * progress of the current {@link BeaconBurst} (null when idle/done), and a
 * `version` that bumps each animation frame so the overlay rebuilds. The rAF
 * loop runs only while a transition, a hover or a burst is in flight.
 */
export function useHoverAnim(
  hoveredId: string | null,
  burst: BeaconBurst | null = null,
): {
  emphasisFor: (id: string) => number;
  /** Looping hover-beacon phase (0..1); 0 while nothing is hovered. */
  getPulse: () => number;
  /** Progress of the current burst (0..1), null when idle or done. */
  getBurstProgress: () => number | null;
  version: number;
} {
  const values = useRef<Map<string, number>>(new Map());
  const pulseRef = useRef(0);
  const burstRef = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const lastTime = useRef(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (hoveredId && !values.current.has(hoveredId)) {
      values.current.set(hoveredId, 0);
    }

    const tick = (now: number) => {
      const dt = lastTime.current ? Math.min(64, now - lastTime.current) : 16;
      lastTime.current = now;
      const k = 1 - Math.exp(-dt / TAU_MS);

      let active = false;
      for (const [id, v] of values.current) {
        const target = id === hoveredId ? 1 : 0;
        const next = v + (target - v) * k;
        if (Math.abs(target - next) <= EPS) {
          if (target === 0) values.current.delete(id);
          else values.current.set(id, 1);
        } else {
          values.current.set(id, next);
          active = true;
        }
      }

      // Beacon pulse loops for as long as something is hovered.
      if (hoveredId) {
        pulseRef.current = (now % PULSE_MS) / PULSE_MS;
        active = true;
      } else {
        pulseRef.current = 0;
      }

      // One-shot burst progress (0..1), null once elapsed.
      if (burst) {
        const p = (now - burst.startedAt) / BURST_MS;
        burstRef.current = p >= 0 && p < 1 ? p : null;
        if (p < 1) active = true;
      } else {
        burstRef.current = null;
      }

      setVersion((x) => x + 1);
      if (active) {
        raf.current = requestAnimationFrame(tick);
      } else {
        raf.current = null;
        lastTime.current = 0;
      }
    };

    if (raf.current === null) {
      lastTime.current = 0;
      raf.current = requestAnimationFrame(tick);
    }

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [hoveredId, burst]);

  const emphasisFor = useCallback(
    (id: string) => values.current.get(id) ?? 0,
    [],
  );
  const getPulse = useCallback(() => pulseRef.current, []);
  const getBurstProgress = useCallback(() => burstRef.current, []);
  return { emphasisFor, getPulse, getBurstProgress, version };
}
