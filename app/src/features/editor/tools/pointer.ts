import type { Vec2 } from "@/morph/model";
import type { ProjectSpaceTransform } from "@/lib/viewport/projectSpace";

/** Pointer kinds we distinguish (pen-ready). */
export type ToolPointerType = "mouse" | "pen" | "touch";

/** A single position sample — the pointer itself and its coalesced sub-samples. */
export type PointerSample = {
  /** Pane-local CSS px. */
  screen: Vec2;
  /** Project space (0..1), unclamped. */
  norm: Vec2;
  pressure: number;
};

/**
 * Normalized pointer event consumed by every tool (PRD M11 lot 2). Built from a
 * React PointerEvent against the pane transform, so tools never touch the DOM.
 * Pen-ready: carries pressure / pointerType / tilt and the high-rate coalesced
 * sub-samples for faithful freehand tracing. The iPad-specific behaviours
 * (pressure→params, palm rejection, gestures) are wired in lot 5.
 */
export type ToolPointer = PointerSample & {
  pointerId: number;
  pointerType: ToolPointerType;
  tiltX: number;
  tiltY: number;
  shiftKey: boolean;
  altKey: boolean;
  /** Sub-samples for this event (oldest→newest); never empty. */
  coalesced: PointerSample[];
};

/**
 * Builds a {@link ToolPointer} from a React PointerEvent, the pane's client rect
 * and the live projectSpace transform. Reads `getCoalescedEvents()` when the
 * platform exposes it so fast strokes keep their intermediate samples.
 */
export function buildToolPointer(
  e: React.PointerEvent,
  rect: DOMRect,
  transform: ProjectSpaceTransform,
): ToolPointer {
  const toSample = (
    clientX: number,
    clientY: number,
    pressure: number,
  ): PointerSample => {
    const screen = { x: clientX - rect.left, y: clientY - rect.top };
    return { screen, norm: transform.toNormalized(screen), pressure };
  };

  const native = e.nativeEvent;
  const coalesced =
    typeof native.getCoalescedEvents === "function"
      ? native
          .getCoalescedEvents()
          .map((c) => toSample(c.clientX, c.clientY, c.pressure))
      : [];

  const main = toSample(e.clientX, e.clientY, e.pressure);
  return {
    ...main,
    pointerId: e.pointerId,
    pointerType: (e.pointerType as ToolPointerType) || "mouse",
    tiltX: e.tiltX ?? 0,
    tiltY: e.tiltY ?? 0,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    coalesced: coalesced.length > 0 ? coalesced : [main],
  };
}

/** Plain screen-px delta between two points (helper for pan / push). */
export function screenDelta(from: Vec2, to: Vec2): Vec2 {
  return { x: to.x - from.x, y: to.y - from.y };
}
