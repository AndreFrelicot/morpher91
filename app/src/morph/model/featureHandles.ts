import type {
  FeaturePair,
  FeaturePatch,
  PolylineFeaturePair,
  RegionFeaturePair,
} from "./features";
import type { NormalizedVec2 } from "./types";

/** Which side of a feature pair a pane edits. */
export type FeatureSide = "a" | "b";

/** A draggable handle of a feature on one side. `key` identifies the vertex. */
export type Handle = { key: string; pos: NormalizedVec2 };

/** Enumerates the editable handles of a feature on the given side. */
export function featureHandles(f: FeaturePair, side: FeatureSide): Handle[] {
  const src = side === "a";
  switch (f.kind) {
    case "point":
      return [{ key: "p", pos: src ? f.a : f.b }];
    case "segment":
      return src
        ? [
            { key: "0", pos: f.a0 },
            { key: "1", pos: f.a1 },
          ]
        : [
            { key: "0", pos: f.b0 },
            { key: "1", pos: f.b1 },
          ];
    case "polyline":
    case "region":
      return (src ? f.a : f.b).map((pos, i) => ({ key: String(i), pos }));
  }
}

/** Patch moving one handle of one side to `pos`. */
export function applyHandle(
  f: FeaturePair,
  side: FeatureSide,
  key: string,
  pos: NormalizedVec2,
): FeaturePatch {
  const src = side === "a";
  switch (f.kind) {
    case "point":
      return src ? { a: pos } : { b: pos };
    case "segment":
      if (key === "0") return src ? { a0: pos } : { b0: pos };
      return src ? { a1: pos } : { b1: pos };
    case "polyline":
    case "region": {
      const i = Number(key);
      const next = (src ? f.a : f.b).map((q, idx) => (idx === i ? pos : q));
      return src ? { a: next } : { b: next };
    }
  }
}

/** Patch moving the same handle on BOTH sides (used while creating). */
export function applyHandleMirrored(
  f: FeaturePair,
  key: string,
  pos: NormalizedVec2,
): FeaturePatch {
  switch (f.kind) {
    case "point":
      return { a: pos, b: pos };
    case "segment":
      return key === "0" ? { a0: pos, b0: pos } : { a1: pos, b1: pos };
    case "polyline":
    case "region": {
      const i = Number(key);
      const map = (arr: NormalizedVec2[]) =>
        arr.map((q, idx) => (idx === i ? pos : q));
      return { a: map(f.a), b: map(f.b) };
    }
  }
}

/** Patch appending a mirrored vertex to a polyline being drafted. */
export function appendPolylineVertex(
  f: PolylineFeaturePair,
  pos: NormalizedVec2,
): FeaturePatch {
  return { a: [...f.a, pos], b: [...f.b, pos] };
}

/** Patch appending a mirrored vertex to a region being drafted. */
export function appendRegionVertex(
  f: RegionFeaturePair,
  pos: NormalizedVec2,
): FeaturePatch {
  return { a: [...f.a, pos], b: [...f.b, pos] };
}
