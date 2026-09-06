/**
 * Solves the dense linear system `A x = b` by Gauss–Jordan elimination with
 * partial pivoting (PRD §19.1). `A` is a square `n × n` matrix (row-major,
 * mutated-safe: a copy is taken); `b` has length `n`. Returns `x` of length `n`.
 *
 * Throws if the matrix is singular (no unique solution). Used by the TPS solver
 * to invert the interpolation matrix.
 */
export function linearSolve(
  A: readonly number[][],
  b: readonly number[],
): number[] {
  const n = b.length;

  // Augmented matrix [A | b], copied so callers keep their inputs.
  const m: number[][] = A.map((row, i) => {
    if (row.length !== n) throw new Error("linearSolve: A must be square");
    return [...row, b[i]];
  });

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in the column improves stability.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      throw new Error("linearSolve: singular matrix");
    }
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }

    // Eliminate the column from every other row.
    const diag = m[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) x[i] = m[i][n] / m[i][i];
  return x;
}
