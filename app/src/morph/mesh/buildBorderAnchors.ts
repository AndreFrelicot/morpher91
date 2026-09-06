import type { NormalizedVec2 } from "@/morph/model";

/**
 * Anchors at the edges of Project Space so the triangulation stays valid (and
 * covers the whole [0,1]² box) even with few or no user points (PRD §10.3).
 * Produces the 4 corners plus `edgesPerSide` evenly spaced interior points on
 * each side → `4 + 4 * edgesPerSide` anchors when `corners` is true.
 */
export function buildBorderAnchors({
  corners = true,
  edgesPerSide,
}: {
  corners?: boolean;
  edgesPerSide: number;
}): NormalizedVec2[] {
  const pts: NormalizedVec2[] = [];

  if (corners) {
    pts.push({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 });
  }

  for (let i = 1; i <= edgesPerSide; i++) {
    const f = i / (edgesPerSide + 1);
    pts.push(
      { x: f, y: 0 }, // top
      { x: f, y: 1 }, // bottom
      { x: 0, y: f }, // left
      { x: 1, y: f }, // right
    );
  }

  return pts;
}
