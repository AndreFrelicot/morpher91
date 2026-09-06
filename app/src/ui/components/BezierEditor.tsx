import { useRef } from "react";
import type { BezierEasing } from "@/morph/model";

const SIZE = 100;
const PAD = 20;
const VIEW = SIZE + PAD * 2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Curve space → SVG user space (y is up in curve space, down in SVG). */
const sx = (x: number) => x * SIZE;
const sy = (y: number) => (1 - y) * SIZE;

/**
 * CSS-style `cubic-bezier` editor: the curve from (0,0) to (1,1) with two
 * draggable handles. Both handles stay inside 0..1 — v1 has no overshoot.
 */
export function BezierEditor({
  value,
  onChange,
  label,
  handleLabels,
}: {
  value: BezierEasing;
  onChange: (next: BezierEasing) => void;
  label: string;
  /** Accessible names of the two handles, e.g. ["Handle 1", "Handle 2"]. */
  handleLabels: [string, string];
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const dragTo = (event: React.PointerEvent, handle: 1 | 2) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const userX =
      (-PAD + ((event.clientX - rect.left) / rect.width) * VIEW) / SIZE;
    const userY =
      1 - (-PAD + ((event.clientY - rect.top) / rect.height) * VIEW) / SIZE;
    const x = clamp01(userX);
    const y = clamp01(userY);
    onChange(
      handle === 1 ? { ...value, x1: x, y1: y } : { ...value, x2: x, y2: y },
    );
  };

  const onHandlePointerDown =
    (handle: 1 | 2) => (event: React.PointerEvent<SVGCircleElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragTo(event, handle);
    };

  const onHandlePointerMove =
    (handle: 1 | 2) => (event: React.PointerEvent<SVGCircleElement>) => {
      if (event.buttons === 0) return;
      dragTo(event, handle);
    };

  const path = `M ${sx(0)} ${sy(0)} C ${sx(value.x1)} ${sy(value.y1)}, ${sx(
    value.x2,
  )} ${sy(value.y2)}, ${sx(1)} ${sy(1)}`;

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={label}
      viewBox={`${-PAD} ${-PAD} ${VIEW} ${VIEW}`}
      className="h-28 w-28 touch-none rounded border border-border bg-background"
    >
      <rect
        x={0}
        y={0}
        width={SIZE}
        height={SIZE}
        className="fill-muted/40 stroke-border"
        strokeWidth={1}
      />
      <line
        x1={sx(0)}
        y1={sy(0)}
        x2={sx(value.x1)}
        y2={sy(value.y1)}
        className="stroke-muted-foreground/50"
        strokeWidth={1}
      />
      <line
        x1={sx(1)}
        y1={sy(1)}
        x2={sx(value.x2)}
        y2={sy(value.y2)}
        className="stroke-muted-foreground/50"
        strokeWidth={1}
      />
      <path d={path} className="fill-none stroke-primary" strokeWidth={2} />
      {([1, 2] as const).map((handle) => (
        <circle
          key={handle}
          role="slider"
          tabIndex={-1}
          aria-label={handleLabels[handle - 1]}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((handle === 1 ? value.x1 : value.x2) * 100)}
          cx={sx(handle === 1 ? value.x1 : value.x2)}
          cy={sy(handle === 1 ? value.y1 : value.y2)}
          r={5}
          className="cursor-grab fill-primary"
          onPointerDown={onHandlePointerDown(handle)}
          onPointerMove={onHandlePointerMove(handle)}
        />
      ))}
    </svg>
  );
}
