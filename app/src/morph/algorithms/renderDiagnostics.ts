export type RenderDiagnostics = {
  tpsSolves: number;
  meshGeometryRebuilds: number;
  meshGeometryUploads: number;
  beierGeometryUploads: number;
};

const counters: RenderDiagnostics = {
  tpsSolves: 0,
  meshGeometryRebuilds: 0,
  meshGeometryUploads: 0,
  beierGeometryUploads: 0,
};

export function recordRenderDiagnostic(key: keyof RenderDiagnostics): void {
  if (import.meta.env.MODE === "test") counters[key]++;
}

/** Test-only observability; production callers never import this module. */
export function readRenderDiagnostics(): Readonly<RenderDiagnostics> {
  return { ...counters };
}

export function resetRenderDiagnostics(): void {
  for (const key of Object.keys(counters) as (keyof RenderDiagnostics)[]) {
    counters[key] = 0;
  }
}
