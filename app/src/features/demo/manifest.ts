/** Typed model + validator for public/demo/manifest.json (M15). */

export type DemoAssetKind = "image" | "video";
export type DemoGroup =
  | "cars"
  | "faces"
  | "cartoon"
  | "singing"
  | "walking"
  | "fruits";

export type DemoLabel = { en: string; fr: string };

export type DemoAsset = {
  id: string;
  kind: DemoAssetKind;
  /** Path relative to /demo/. */
  file: string;
  thumb: string;
  width: number;
  height: number;
  /** Seconds; null for images. */
  durationSec: number | null;
  label: DemoLabel;
  group: DemoGroup;
};

export type DemoPreset = {
  id: string;
  label: DemoLabel;
  thumb: string;
  /** Source/target contact pair, not a fabricated preview of the morph. */
  targetThumb?: string;
  file: string;
  /**
   * Demo video assets to re-attach after the project loads (slot → asset id).
   * Saved .morph.json files keep videos as placeholders (no embedded bytes),
   * so video presets declare here which bundled videos fill the slots.
   */
  videos?: { source?: string; target?: string };
  /** Authored starting view, after media and timeline have been restored. */
  presentation?: {
    view: "compare" | "edit" | "preview" | "triple";
    timeSec: number;
    layerId?: string;
    featureId?: string;
  };
};

export type DemoManifest = {
  version: number;
  assets: DemoAsset[];
  presets: DemoPreset[];
};

const KINDS: readonly string[] = ["image", "video"];
const GROUPS: readonly string[] = [
  "cars",
  "faces",
  "cartoon",
  "singing",
  "walking",
  "fruits",
];

function isLabel(v: unknown): v is DemoLabel {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as DemoLabel).en === "string" &&
    (v as DemoLabel).en.length > 0 &&
    typeof (v as DemoLabel).fr === "string" &&
    (v as DemoLabel).fr.length > 0
  );
}

function assertAsset(v: unknown, index: number): asserts v is DemoAsset {
  const a = v as DemoAsset;
  const where = `assets[${index}]`;
  if (typeof a?.id !== "string" || !a.id) {
    throw new Error(`${where}: missing id`);
  }
  if (!KINDS.includes(a.kind)) throw new Error(`${where}: bad kind ${a.kind}`);
  if (typeof a.file !== "string" || !a.file) {
    throw new Error(`${where}: missing file`);
  }
  if (typeof a.thumb !== "string" || !a.thumb) {
    throw new Error(`${where}: missing thumb`);
  }
  if (!Number.isFinite(a.width) || a.width <= 0) {
    throw new Error(`${where}: bad width`);
  }
  if (!Number.isFinite(a.height) || a.height <= 0) {
    throw new Error(`${where}: bad height`);
  }
  if (a.kind === "video") {
    if (!Number.isFinite(a.durationSec) || (a.durationSec ?? 0) <= 0) {
      throw new Error(`${where}: video needs a positive durationSec`);
    }
  } else if (a.durationSec !== null) {
    throw new Error(`${where}: image durationSec must be null`);
  }
  if (!isLabel(a.label)) throw new Error(`${where}: bad label`);
  if (!GROUPS.includes(a.group)) {
    throw new Error(`${where}: bad group ${a.group}`);
  }
}

function assertPreset(v: unknown, index: number): asserts v is DemoPreset {
  const p = v as DemoPreset;
  const where = `presets[${index}]`;
  if (typeof p?.id !== "string" || !p.id) {
    throw new Error(`${where}: missing id`);
  }
  if (!isLabel(p.label)) throw new Error(`${where}: bad label`);
  if (typeof p.thumb !== "string") throw new Error(`${where}: missing thumb`);
  if (p.targetThumb !== undefined && typeof p.targetThumb !== "string")
    throw new Error(`${where}: bad targetThumb`);
  if (typeof p.file !== "string" || !p.file) {
    throw new Error(`${where}: missing file`);
  }
  if (p.presentation !== undefined) {
    const start = p.presentation;
    if (
      !start ||
      !["compare", "edit", "preview", "triple"].includes(start.view) ||
      !Number.isFinite(start.timeSec) ||
      start.timeSec < 0 ||
      (start.layerId !== undefined && typeof start.layerId !== "string") ||
      (start.featureId !== undefined && typeof start.featureId !== "string")
    )
      throw new Error(`${where}: invalid presentation`);
  }
  if (p.videos !== undefined) {
    if (typeof p.videos !== "object" || p.videos === null) {
      throw new Error(`${where}: videos must be an object`);
    }
    for (const slot of ["source", "target"] as const) {
      const id = p.videos[slot];
      if (id !== undefined && (typeof id !== "string" || !id)) {
        throw new Error(`${where}: videos.${slot} must be an asset id`);
      }
    }
  }
}

/** Validates a parsed manifest.json; throws with a precise path on error. */
export function parseDemoManifest(json: unknown): DemoManifest {
  const m = json as DemoManifest;
  if (typeof m?.version !== "number") throw new Error("manifest: bad version");
  if (!Array.isArray(m.assets)) throw new Error("manifest: assets not a list");
  if (!Array.isArray(m.presets)) {
    throw new Error("manifest: presets not a list");
  }
  m.assets.forEach((a, i) => assertAsset(a, i));
  m.presets.forEach((p, i) => assertPreset(p, i));
  const ids = new Set(m.assets.map((a) => a.id));
  if (ids.size !== m.assets.length) {
    throw new Error("manifest: duplicate asset ids");
  }
  const videoIds = new Set(
    m.assets.filter((a) => a.kind === "video").map((a) => a.id),
  );
  m.presets.forEach((p, i) => {
    for (const slot of ["source", "target"] as const) {
      const id = p.videos?.[slot];
      if (id !== undefined && !videoIds.has(id)) {
        throw new Error(
          `presets[${i}]: videos.${slot} "${id}" is not a video asset`,
        );
      }
    }
  });
  return m;
}
