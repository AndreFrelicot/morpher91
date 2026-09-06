import type { FeaturePair } from "./features";
import type { ImageAsset } from "./image";
import type { MorphLayer } from "./layers";
import { defaultGlobalLayer } from "./layers";
import type { ProjectVideos } from "./video";
import { defaultAlgorithmSettings, type AlgorithmSettings } from "./algorithms";
import type {
  FeatureId,
  LayerId,
  MorphAlgorithmId,
  ProjectId,
  Vec2,
} from "./types";

export type TimelineSettings = {
  durationSec: number;
  fps: number;
  loop: boolean;
  pingPong: boolean;
};

export type CanvasSettings = {
  aspectRatio: "1:1" | "4:3" | "16:9" | "custom";
  width: number;
  height: number;
  background: "transparent" | "checkerboard" | "black" | "white";
};

/** Top-level project document. PRD §7.4 */
export type MorphProject = {
  version: 1;
  id: ProjectId;
  name: string;
  createdAt: string;
  updatedAt: string;
  canvas: CanvasSettings;
  images: {
    source: ImageAsset;
    target: ImageAsset;
  };
  videos?: ProjectVideos;
  features: FeaturePair[];
  layers: MorphLayer[];
  timeline: TimelineSettings;
  activeAlgorithm: MorphAlgorithmId;
  algorithmSettings: AlgorithmSettings;
  ui?: {
    selectedFeatureIds: FeatureId[];
    selectedLayerId?: LayerId;
    zoom: number;
    pan: Vec2;
  };
};

export function createProject(
  source: ImageAsset,
  target: ImageAsset,
  name = "Untitled morph",
): MorphProject {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    canvas: {
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
      background: "black",
    },
    images: { source, target },
    features: [],
    layers: [defaultGlobalLayer()],
    timeline: { durationSec: 4, fps: 30, loop: true, pingPong: false },
    activeAlgorithm: "crossfade",
    algorithmSettings: defaultAlgorithmSettings(),
  };
}
