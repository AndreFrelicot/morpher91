import { useRef, type ChangeEvent, type PointerEvent } from "react";

/** Explicit Pencil dragging; mouse, keyboard and AT keep the native range. */
export function usePenScrub(
  durationSec: number,
  onChange: (sec: number) => void,
) {
  const pointerId = useRef<number | null>(null);

  const seek = (event: PointerEvent<HTMLInputElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    onChange(fraction * durationSec);
  };

  const release = (event: PointerEvent<HTMLInputElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    onPointerDown: (event: PointerEvent<HTMLInputElement>) => {
      if (pointerId.current !== null) {
        event.preventDefault();
        return;
      }
      if (event.pointerType !== "pen" || event.button !== 0) return;
      // Do not let the native range start a competing thumb drag in Safari.
      event.preventDefault();
      pointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      seek(event);
    },
    onPointerMove: (event: PointerEvent<HTMLInputElement>) => {
      if (pointerId.current !== event.pointerId) return;
      event.preventDefault();
      seek(event);
    },
    onPointerUp: (event: PointerEvent<HTMLInputElement>) => {
      if (pointerId.current !== event.pointerId) return;
      event.preventDefault();
      seek(event);
      release(event);
    },
    onPointerCancel: release,
    onLostPointerCapture: (event: PointerEvent<HTMLInputElement>) => {
      if (pointerId.current === event.pointerId) pointerId.current = null;
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (pointerId.current === null) onChange(event.target.valueAsNumber);
    },
  };
}
