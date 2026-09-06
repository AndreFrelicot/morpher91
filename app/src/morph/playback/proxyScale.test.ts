import { describe, expect, it } from "vitest";
import {
  PROXY_BUDGET_BYTES,
  PROXY_BUDGET_BYTES_CONSTRAINED,
  planProxy,
} from "./proxyScale";

describe("planProxy", () => {
  it("keeps the demo clips at half scale on desktop", () => {
    // 166 frames of 1112×834 → 556×417 rgba8 ≈ 154 MB.
    const plan = planProxy(166, 1112, 834, PROXY_BUDGET_BYTES);
    expect(plan).toEqual({ scale: 0.5, width: 556, height: 417 });
  });

  it("drops to a smaller ratio when half scale exceeds the budget", () => {
    const plan = planProxy(166, 1112, 834, PROXY_BUDGET_BYTES_CONSTRAINED);
    expect(plan?.scale).toBe(1 / 4);
    expect(plan?.width).toBe(278);
    expect(plan?.height).toBe(209);
  });

  it("gives up below a quarter scale (long or 4K clips)", () => {
    // 10 s of 4K at 30 fps: even 1/4 scale is 300 × 960×540×4 ≈ 622 MB.
    expect(planProxy(300, 3840, 2160, PROXY_BUDGET_BYTES)).toBeNull();
  });

  it("returns null for degenerate inputs", () => {
    expect(planProxy(0, 1112, 834, PROXY_BUDGET_BYTES)).toBeNull();
    expect(planProxy(10, 0, 834, PROXY_BUDGET_BYTES)).toBeNull();
    expect(planProxy(Number.NaN, 1112, 834, PROXY_BUDGET_BYTES)).toBeNull();
  });
});
