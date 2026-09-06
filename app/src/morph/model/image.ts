import type { ImageId, Vec2 } from "./types";

export type ImageTimeline = {
  startSec: number;
  durationSec: number;
};

/** Transforms the original image into Project Space. PRD §7.3 */
export type ImagePlacement = {
  mode: "contain" | "cover" | "manual";
  /** Crop in normalized coordinates of the source image. */
  crop: { x: number; y: number; width: number; height: number };
  scale: number;
  rotationRad: number;
  translate: Vec2;
};

export type ImageAsset = {
  id: ImageId;
  name: string;
  width: number;
  height: number;
  /**
   * Embedded data URL, object URL, IndexedDB key, or bundled demo asset id. No
   * remote URLs by default to avoid CORS/canvas tainting.
   * `external-file-placeholder` marks a legacy image that must be re-imported
   * after loading a saved project; its `value` is the original filename.
   */
  source: {
    kind:
      | "data-url"
      | "object-url"
      | "indexed-db"
      | "bundled"
      | "external-file-placeholder";
    value: string;
  };
  placement: ImagePlacement;
  /** Omitted in legacy projects: present for the entire master timeline. */
  timeline?: ImageTimeline;
};

export function defaultPlacement(): ImagePlacement {
  return {
    mode: "contain",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    scale: 1,
    rotationRad: 0,
    translate: { x: 0, y: 0 },
  };
}
