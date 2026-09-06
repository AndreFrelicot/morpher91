type Axis = "x" | "y";

const SCROLLABLE_OVERFLOW = /^(auto|scroll)$/;
const EDGE_TOLERANCE_PX = 1;
const TAP_SLOP_PX = 8;

function isStylus(touch: Touch): boolean {
  return (touch as Touch & { touchType?: string }).touchType === "stylus";
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function canConsumeMovement(
  element: Element,
  axis: Axis,
  fingerDelta: number,
): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  if (!SCROLLABLE_OVERFLOW.test(overflow)) return false;

  const position = axis === "y" ? element.scrollTop : element.scrollLeft;
  const viewportSize =
    axis === "y" ? element.clientHeight : element.clientWidth;
  const contentSize = axis === "y" ? element.scrollHeight : element.scrollWidth;
  const maximum = contentSize - viewportSize;
  if (maximum <= EDGE_TOLERANCE_PX) return false;

  if (fingerDelta > 0) return position > EDGE_TOLERANCE_PX;
  if (fingerDelta < 0) return position < maximum - EDGE_TOLERANCE_PX;
  return true;
}

function hasScrollableAncestor(
  target: Element,
  axis: Axis,
  fingerDelta: number,
): boolean {
  const { body, documentElement } = target.ownerDocument;
  for (
    let element: Element | null = target;
    element && element !== body && element !== documentElement;
    element = element.parentElement
  ) {
    if (canConsumeMovement(element, axis, fingerDelta)) return true;
  }
  return false;
}

/**
 * Prevents Safari's document-level rubber-band/pull-to-refresh gesture while
 * preserving pen input, taps, native range controls and inner-panel scrolling.
 * Cancelling even a tiny touchmove can suppress Safari's subsequent click.
 */
export function installViewportScrollLock(
  ownerDocument: Document = document,
): () => void {
  let previousX = 0;
  let previousY = 0;
  let trackingSingleTouch = false;
  let dragging = false;
  const penPointers = new Set<number>();

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "pen") penPointers.add(event.pointerId);
  };
  const onPointerEnd = (event: PointerEvent) => {
    penPointers.delete(event.pointerId);
  };

  const onTouchStart = (event: TouchEvent) => {
    dragging = false;
    if (
      event.touches.length !== 1 ||
      penPointers.size > 0 ||
      isStylus(event.touches[0])
    ) {
      trackingSingleTouch = false;
      return;
    }
    previousX = event.touches[0].clientX;
    previousY = event.touches[0].clientY;
    trackingSingleTouch = true;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!trackingSingleTouch || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (penPointers.size > 0 || isStylus(touch)) return;
    const deltaX = touch.clientX - previousX;
    const deltaY = touch.clientY - previousY;
    // Keep the initial coordinates until the gesture actually becomes a drag,
    // so a succession of small moves still crosses the threshold.
    if (!dragging && Math.hypot(deltaX, deltaY) < TAP_SLOP_PX) return;
    dragging = true;
    previousX = touch.clientX;
    previousY = touch.clientY;

    const axis: Axis = Math.abs(deltaY) >= Math.abs(deltaX) ? "y" : "x";
    const delta = axis === "y" ? deltaY : deltaX;
    if (delta === 0) return;

    const target = eventTargetElement(event.target);
    if (!target) {
      event.preventDefault();
      return;
    }
    if (axis === "x" && target.closest('input[type="range"]')) return;
    if (!hasScrollableAncestor(target, axis, delta)) event.preventDefault();
  };

  const stopTracking = () => {
    trackingSingleTouch = false;
    dragging = false;
  };

  ownerDocument.addEventListener("pointerdown", onPointerDown, true);
  ownerDocument.addEventListener("pointerup", onPointerEnd, true);
  ownerDocument.addEventListener("pointercancel", onPointerEnd, true);
  ownerDocument.addEventListener("touchstart", onTouchStart, {
    capture: true,
    passive: true,
  });
  ownerDocument.addEventListener("touchmove", onTouchMove, {
    capture: true,
    passive: false,
  });
  ownerDocument.addEventListener("touchend", stopTracking, {
    capture: true,
    passive: true,
  });
  ownerDocument.addEventListener("touchcancel", stopTracking, {
    capture: true,
    passive: true,
  });

  return () => {
    ownerDocument.removeEventListener("pointerdown", onPointerDown, true);
    ownerDocument.removeEventListener("pointerup", onPointerEnd, true);
    ownerDocument.removeEventListener("pointercancel", onPointerEnd, true);
    ownerDocument.removeEventListener("touchstart", onTouchStart, true);
    ownerDocument.removeEventListener("touchmove", onTouchMove, true);
    ownerDocument.removeEventListener("touchend", stopTracking, true);
    ownerDocument.removeEventListener("touchcancel", stopTracking, true);
  };
}
