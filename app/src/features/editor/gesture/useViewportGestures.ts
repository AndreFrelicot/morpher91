import { useRef, type PointerEvent, type WheelEvent } from "react";
import type { Vec2 } from "@/morph/model";
import { useEditorStore, type ViewportSlot } from "@/store/editorStore";
import {
  beginPinch,
  MAX_ZOOM,
  MIN_ZOOM,
  updatePinch,
  wheelZoomFactor,
} from "./pinch";

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 24;

type GestureEvent<T extends HTMLElement> = PointerEvent<T>;

export type ViewportGestureOptions<T extends HTMLElement> = {
  slot: ViewportSlot;
  enabled?: boolean;
  getSize: () => { width: number; height: number };
  getAspect: () => number;
  acceptPointer?: (event: GestureEvent<T>) => boolean;
  acceptWheel?: (event: WheelEvent<T>) => boolean;
  canDoubleReset?: (event: GestureEvent<T>) => boolean;
  onPrimaryDown?: (event: GestureEvent<T>, point: Vec2) => void;
  onPrimaryMove?: (event: GestureEvent<T>, point: Vec2) => void;
  onPrimaryEnd?: (
    event: GestureEvent<T>,
    point: Vec2,
    cancelled: boolean,
  ) => void;
  onHoverMove?: (event: GestureEvent<T>, point: Vec2) => void;
  onPinchStart?: () => void;
  onPinchEnd?: () => void;
  onPointerLeave?: () => void;
};

/** Shared pointer bookkeeping for pan/tool, pinch, wheel and double reset. */
export function useViewportGestures<T extends HTMLElement>(
  options: ViewportGestureOptions<T>,
) {
  const pointers = useRef(new Map<number, Vec2>());
  const pinch = useRef<ReturnType<typeof beginPinch> | null>(null);
  const primaryId = useRef<number | null>(null);
  const lastTap = useRef<{ time: number; point: Vec2 } | null>(null);

  const localPoint = (event: GestureEvent<T>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const firstTwo = () => {
    const iterator = pointers.current.values();
    return {
      a: iterator.next().value as Vec2,
      b: iterator.next().value as Vec2,
    };
  };

  const onPointerDown = (event: GestureEvent<T>) => {
    if (options.enabled === false || options.acceptPointer?.(event) === false) {
      return;
    }
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size >= 2) {
      if (!pinch.current) {
        options.onPinchStart?.();
        primaryId.current = null;
        const size = options.getSize();
        pinch.current = beginPinch(
          firstTwo(),
          size.width || 1,
          size.height || 1,
          options.getAspect(),
          useEditorStore.getState().viewports[options.slot],
        );
      }
      return;
    }
    primaryId.current = event.pointerId;
    options.onPrimaryDown?.(event, point);
  };

  const onPointerMove = (event: GestureEvent<T>) => {
    const point = localPoint(event);
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, point);
    }
    if (pinch.current) {
      if (pointers.current.size >= 2) {
        useEditorStore
          .getState()
          .setViewport(options.slot, updatePinch(pinch.current, firstTwo()));
      }
      return;
    }
    if (primaryId.current === null) {
      options.onHoverMove?.(event, point);
    } else if (event.pointerId === primaryId.current) {
      options.onPrimaryMove?.(event, point);
    }
  };

  const maybeReset = (event: GestureEvent<T>, point: Vec2) => {
    if (options.canDoubleReset?.(event) === false) return;
    const now = Date.now();
    const previous = lastTap.current;
    lastTap.current = { time: now, point };
    if (
      previous &&
      now - previous.time < DOUBLE_TAP_MS &&
      Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <
        DOUBLE_TAP_PX
    ) {
      useEditorStore
        .getState()
        .setViewport(options.slot, { zoom: 1, pan: { x: 0, y: 0 } });
      lastTap.current = null;
    }
  };

  const endPointer = (event: GestureEvent<T>, cancelled: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null;
        options.onPinchEnd?.();
      }
      return;
    }
    if (event.pointerId !== primaryId.current) return;
    const point = localPoint(event);
    options.onPrimaryEnd?.(event, point, cancelled);
    primaryId.current = null;
    if (!cancelled) maybeReset(event, point);
  };

  const onWheel = (event: WheelEvent<T>) => {
    if (options.enabled === false || options.acceptWheel?.(event) === false) {
      return;
    }
    const factor = wheelZoomFactor(event);
    const state = useEditorStore.getState();
    const zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, state.viewports[options.slot].zoom * factor),
    );
    state.setViewport(options.slot, { zoom });
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: GestureEvent<T>) => endPointer(event, false),
    onPointerCancel: (event: GestureEvent<T>) => endPointer(event, true),
    onPointerLeave: () => {
      if (!pinch.current) options.onPointerLeave?.();
    },
    onWheel,
  };
}
