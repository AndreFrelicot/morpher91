/** Per-algorithm settings. PRD §25, defaults from §10.4 / §10.5. */

export type CrossfadeSettings = {
  gammaCorrectBlend: boolean;
};

export type MeshSettings = {
  borderAnchors: boolean;
  borderAnchorCount: number;
  showWireframe: boolean;
};

export type TpsSettings = {
  lambda: number;
  borderAnchors: boolean;
  borderAnchorCount: number;
  samplePolylines: boolean;
  polylineSampleSpacing: number;
  /** Show the deformed-grid overlay (PRD §14.5). */
  showGrid: boolean;
};

export type BeierNeelySettings = {
  a: number;
  b: number;
  p: number;
  maxLines: number;
  samplePolylines: boolean;
};

export type AlgorithmSettings = {
  crossfade: CrossfadeSettings;
  mesh: MeshSettings;
  thinPlateSpline: TpsSettings;
  beierNeely: BeierNeelySettings;
};

export function defaultAlgorithmSettings(): AlgorithmSettings {
  return {
    crossfade: { gammaCorrectBlend: false },
    mesh: { borderAnchors: true, borderAnchorCount: 8, showWireframe: false },
    thinPlateSpline: {
      lambda: 0.001,
      borderAnchors: true,
      borderAnchorCount: 8,
      samplePolylines: true,
      polylineSampleSpacing: 0.03,
      showGrid: false,
    },
    beierNeely: {
      a: 0.001,
      b: 2,
      p: 0,
      maxLines: 256,
      samplePolylines: true,
    },
  };
}
