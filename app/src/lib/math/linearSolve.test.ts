import { describe, expect, it } from "vitest";
import { linearSolve } from "./linearSolve";

const close = (x: number[], expected: number[]) => {
  expect(x).toHaveLength(expected.length);
  for (let i = 0; i < x.length; i++) expect(x[i]).toBeCloseTo(expected[i], 9);
};

describe("linearSolve", () => {
  it("solves a 2x2 system", () => {
    // 2x + y = 5 ; x - y = 1  → x = 2, y = 1
    close(
      linearSolve(
        [
          [2, 1],
          [1, -1],
        ],
        [5, 1],
      ),
      [2, 1],
    );
  });

  it("solves a 3x3 system", () => {
    // Known solution x = [1, -2, 3].
    const A = [
      [2, 1, -1],
      [-3, -1, 2],
      [-2, 1, 2],
    ];
    const x = [1, -2, 3];
    const b = A.map((row) => row[0] * x[0] + row[1] * x[1] + row[2] * x[2]);
    close(linearSolve(A, b), x);
  });

  it("solves an NxN system (identity)", () => {
    const n = 6;
    const A = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    );
    const b = [3, -1, 4, 1, 5, 9];
    close(linearSolve(A, b), b);
  });

  it("solves an NxN system requiring pivoting (zero leading pivot)", () => {
    // First pivot is 0 → must swap rows.
    const A = [
      [0, 2, 1],
      [1, 0, 1],
      [1, 1, 0],
    ];
    const x = [2, -1, 3];
    const b = A.map((row) => row[0] * x[0] + row[1] * x[1] + row[2] * x[2]);
    close(linearSolve(A, b), x);
  });

  it("throws on a singular matrix", () => {
    expect(() =>
      linearSolve(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(/singular/);
  });
});
