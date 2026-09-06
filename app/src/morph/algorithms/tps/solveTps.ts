import { linearSolve } from "@/lib/math/linearSolve";
import type { Vec2 } from "@/morph/model";

/**
 * Solved Thin-Plate Spline warp (PRD §10.4). `T(x) = affine + Σ wᵢ·U(‖x−pᵢ‖)`
 * with the source landmarks `points`, evaluated by {@link evalTps}.
 */
export type TpsCoefficients = {
  /** Source landmarks (px, py interleaved) — the points the warp maps from. */
  points: Float32Array;
  weightsX: Float32Array;
  weightsY: Float32Array;
  affineX: Float32Array; // a0, ax, ay
  affineY: Float32Array; // a0, ax, ay
};

/** TPS basis function U(r) = r²·log(r), with the §10.4 numerical guard. */
export function tpsKernel(r: number): number {
  if (r < 1e-6) return 0;
  return r * r * Math.log(r);
}

/**
 * Builds the TPS warp mapping `src` landmarks onto `dst` (PRD §10.4). Solves the
 * `(n+3)×(n+3)` system `L = [[K+λI, P], [Pᵀ, 0]]` twice (X and Y components),
 * with `Kᵢⱼ = U(‖pᵢ−pⱼ‖)` and `Pᵢ = [1, xᵢ, yᵢ]`. `lambda` is the regularization
 * (0 = exact interpolation). Both arrays are (x, y) interleaved, length `2n`.
 */
export function solveTps(
  src: Float32Array,
  dst: Float32Array,
  lambda: number,
): TpsCoefficients {
  const n = src.length / 2;
  const size = n + 3;
  const L: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );

  for (let i = 0; i < n; i++) {
    const xi = src[i * 2];
    const yi = src[i * 2 + 1];
    // K block (+ λ on the diagonal).
    for (let j = 0; j < n; j++) {
      const dx = xi - src[j * 2];
      const dy = yi - src[j * 2 + 1];
      L[i][j] = tpsKernel(Math.hypot(dx, dy));
    }
    L[i][i] += lambda;
    // P and Pᵀ blocks.
    L[i][n] = 1;
    L[i][n + 1] = xi;
    L[i][n + 2] = yi;
    L[n][i] = 1;
    L[n + 1][i] = xi;
    L[n + 2][i] = yi;
  }

  const bx = new Array<number>(size).fill(0);
  const by = new Array<number>(size).fill(0);
  for (let i = 0; i < n; i++) {
    bx[i] = dst[i * 2];
    by[i] = dst[i * 2 + 1];
  }

  const solX = linearSolve(L, bx);
  const solY = linearSolve(L, by);

  const weightsX = new Float32Array(n);
  const weightsY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    weightsX[i] = solX[i];
    weightsY[i] = solY[i];
  }

  return {
    points: Float32Array.from(src),
    weightsX,
    weightsY,
    affineX: Float32Array.of(solX[n], solX[n + 1], solX[n + 2]),
    affineY: Float32Array.of(solY[n], solY[n + 1], solY[n + 2]),
  };
}

/** Evaluates a solved TPS warp at one point (CPU mirror of the WGSL `eval_tps`). */
export function evalTps(c: TpsCoefficients, x: number, y: number): Vec2 {
  let rx = c.affineX[0] + c.affineX[1] * x + c.affineX[2] * y;
  let ry = c.affineY[0] + c.affineY[1] * x + c.affineY[2] * y;
  const n = c.points.length / 2;
  for (let i = 0; i < n; i++) {
    const u = tpsKernel(
      Math.hypot(x - c.points[i * 2], y - c.points[i * 2 + 1]),
    );
    rx += c.weightsX[i] * u;
    ry += c.weightsY[i] * u;
  }
  return { x: rx, y: ry };
}
