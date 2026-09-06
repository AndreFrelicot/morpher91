/** Progress quantization step for overlay geometry keys — same granularity as
 * the feature-time sampling memo (featureTimeline, M22 lot 1). */
export const OVERLAY_T_QUANT = 1 / 240;

export const quantizeOverlayT = (t: number): number =>
  Math.round(t / OVERLAY_T_QUANT) * OVERLAY_T_QUANT;

type Entry<V> = { settings: unknown; byKey: Map<string, V> };

/**
 * Geometry memo for overlay grids. Results are keyed by a stable identity
 * object (a features array or an overlay project — WeakMap, so entries die
 * with the project), the settings object identity, and a short string key
 * (quantized t + pane). A settings identity change resets that identity's
 * entries; the per-identity map is cleared wholesale if it ever overflows.
 */
export class OverlayGeometryCache<V> {
  private readonly entries = new WeakMap<object, Entry<V>>();

  get(identity: object, settings: unknown, key: string, compute: () => V): V {
    let entry = this.entries.get(identity);
    if (!entry || entry.settings !== settings) {
      entry = { settings, byKey: new Map() };
      this.entries.set(identity, entry);
    }
    const cached = entry.byKey.get(key);
    if (cached !== undefined) return cached;
    const value = compute();
    if (entry.byKey.size >= 512) entry.byKey.clear();
    entry.byKey.set(key, value);
    return value;
  }
}
