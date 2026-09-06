/**
 * Proxy sizing for the whole-clip scrub proxy (M23). Every frame of a clip is
 * kept as a reduced rgba8 texture so any τ has an image ready at once; the
 * scale is the largest of a few simple ratios whose full-clip footprint fits
 * the budget. Below a quarter scale the proxy is not worth its blur: null.
 */

/** Per-side GPU budget for the proxy tier. */
export const PROXY_BUDGET_BYTES = 192 * 1024 * 1024;
export const PROXY_BUDGET_BYTES_CONSTRAINED = 48 * 1024 * 1024;

const PROXY_SCALES = [1 / 2, 1 / 3, 1 / 4];
const BYTES_PER_PIXEL = 4; // rgba8unorm

export type ProxyPlan = { scale: number; width: number; height: number };

/** The proxy plan for a clip of `frameCount` frames at `width`×`height`, or
 * null when no scale down to 1/4 fits `budgetBytes`. */
export function planProxy(
  frameCount: number,
  width: number,
  height: number,
  budgetBytes: number,
): ProxyPlan | null {
  if (!(frameCount > 0) || !(width > 0) || !(height > 0)) return null;
  for (const scale of PROXY_SCALES) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (frameCount * w * h * BYTES_PER_PIXEL <= budgetBytes) {
      return { scale, width: w, height: h };
    }
  }
  return null;
}
