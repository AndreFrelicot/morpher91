import { create } from "zustand";
import type { LoadedImage } from "@/lib/image/loadImage";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import { disposeSlotMedia } from "@/lib/media/disposeMedia";
import {
  canAddUserLayer,
  createProject,
  imageTimelineForProject,
  defaultLayerClip,
  normalizeLayerClip,
  normalizeVideoTimeline,
  normalizeVideoTimelineToMaster,
  PROJECT_LIMITS,
  type BeierNeelySettings,
  type FeatureId,
  type FeaturePair,
  type FeaturePatch,
  GLOBAL_LAYER_ID,
  type LayerId,
  type MeshSettings,
  type MorphAlgorithmId,
  type MorphLayer,
  type MorphProject,
  type TimelineSlot,
  type TpsSettings,
  type VideoTimeline,
  type ImageTimeline,
  timelineEndSec,
  assertVideoRelinkCandidate,
  VideoRelinkError,
} from "@/morph/model";

export type ImageSlot = "source" | "target";

/**
 * Project state. The two loaded images keep their non-serializable bitmap
 * (consumed by the WebGPU canvas), while `project` is the serializable
 * MorphProject document, assembled once both images are present (PRD §7.4).
 */
export type ProjectState = {
  source: LoadedImage | null;
  target: LoadedImage | null;
  sourceVideo: LoadedVideo | null;
  targetVideo: LoadedVideo | null;
  project: MorphProject | null;
  /** Seed algorithm used when the project is first assembled. */
  activeAlgorithm: MorphAlgorithmId;
  setImage: (slot: ImageSlot, image: LoadedImage) => void;
  setVideo: (slot: ImageSlot, video: LoadedVideo) => void;
  /** Reconnects a saved video placeholder without changing document identity. */
  relinkVideo: (slot: ImageSlot, video: LoadedVideo) => void;
  updateVideoTimeline: (
    slot: TimelineSlot,
    timeline: Partial<VideoTimeline>,
  ) => void;
  updateImageTimeline: (
    slot: TimelineSlot,
    timeline: Partial<ImageTimeline>,
  ) => void;
  setProject: (project: MorphProject) => void;
  /** Loads a saved document and any hydrated embedded bitmaps. */
  loadProject: (
    project: MorphProject,
    images?: { source?: LoadedImage | null; target?: LoadedImage | null },
  ) => void;
  setAlgorithm: (id: MorphAlgorithmId) => void;
  /** Patch the mesh algorithm settings (e.g. wireframe toggle). */
  setMeshSettings: (patch: Partial<MeshSettings>) => void;
  /** Patch the TPS algorithm settings (lambda, anchors, grid overlay…). */
  setTpsSettings: (patch: Partial<TpsSettings>) => void;
  /** Patch the Beier–Neely algorithm settings (a/b/p, maxLines, sampling). */
  setBeierSettings: (patch: Partial<BeierNeelySettings>) => void;
  addLayer: (layer: MorphLayer) => void;
  updateLayer: (id: LayerId, patch: Partial<MorphLayer>) => void;
  removeLayer: (id: LayerId) => void;
  addFeature: (feature: FeaturePair) => void;
  updateFeature: (id: FeatureId, patch: FeaturePatch) => void;
  removeFeature: (id: FeatureId) => void;
  setFeatureLayer: (featureId: FeatureId, layerId: LayerId | null) => void;
  /** Replace the whole feature list (used by undo/redo). */
  setFeatures: (features: FeaturePair[]) => void;
  resetProject: () => void;
};

type VideoAvailabilityState = Pick<
  ProjectState,
  "project" | "sourceVideo" | "targetVideo"
>;

export function missingProjectVideoSlots(
  state: VideoAvailabilityState,
): ImageSlot[] {
  if (!state.project?.videos) return [];
  const missing: ImageSlot[] = [];
  if (state.project.videos.source && !state.sourceVideo) missing.push("source");
  if (state.project.videos.target && !state.targetVideo) missing.push("target");
  return missing;
}

export function hasMissingProjectVideos(
  state: VideoAvailabilityState,
): boolean {
  return missingProjectVideoSlots(state).length > 0;
}

const now = () => new Date().toISOString();
const TIMELINE_TOLERANCE_SEC = 1e-6;

function clampTrackToTimeline<T extends { timeSec: number }>(
  track: T[],
  durationSec: number,
): T[] {
  const retained = track
    .filter((frame) => frame.timeSec <= durationSec + TIMELINE_TOLERANCE_SEC)
    .map((frame) => ({
      ...frame,
      timeSec: Math.min(frame.timeSec, durationSec),
    }));
  if (retained.length > 0 || track.length === 0) return retained;
  const nearest = track.reduce((first, frame) =>
    frame.timeSec < first.timeSec ? frame : first,
  );
  return [{ ...nearest, timeSec: durationSec }];
}

function clampFeatureTracks(
  feature: FeaturePair,
  durationSec: number,
): FeaturePair {
  if (!feature.tracks) return feature;
  const tracks = Object.fromEntries(
    Object.entries(feature.tracks).map(([key, track]) => [
      key,
      track ? clampTrackToTimeline(track, durationSec) : track,
    ]),
  );
  return { ...feature, tracks } as FeaturePair;
}

function clampLayerClip(
  clip: NonNullable<MorphLayer["clip"]>,
  durationSec: number,
): NonNullable<MorphLayer["clip"]> {
  const nextDurationSec = Math.min(
    durationSec,
    Math.max(0.001, clip.durationSec),
  );
  return {
    ...clip,
    startSec: Math.min(
      Math.max(0, clip.startSec),
      Math.max(0, durationSec - nextDurationSec),
    ),
    durationSec: nextDurationSec,
  };
}

function disposeAllMedia(state: ProjectState): void {
  disposeSlotMedia(state.source, state.sourceVideo);
  disposeSlotMedia(state.target, state.targetVideo);
}

function projectWithTimelineBounds(project: MorphProject): MorphProject {
  const durationSec = Math.min(
    timelineEndSec(project),
    PROJECT_LIMITS.timelineDurationSec,
  );
  const videos = project.videos
    ? {
        source: project.videos.source
          ? {
              ...project.videos.source,
              timeline: normalizeVideoTimelineToMaster(
                project.videos.source.timeline,
                project.videos.source.durationSec,
                durationSec,
              ),
            }
          : undefined,
        target: project.videos.target
          ? {
              ...project.videos.target,
              timeline: normalizeVideoTimelineToMaster(
                project.videos.target.timeline,
                project.videos.target.durationSec,
                durationSec,
              ),
            }
          : undefined,
      }
    : undefined;
  const withVideos = { ...project, videos };
  return {
    ...withVideos,
    timeline: {
      ...withVideos.timeline,
      durationSec,
    },
    features: withVideos.features.map((feature) =>
      clampFeatureTracks(feature, durationSec),
    ),
    layers: withVideos.layers.map((layer) => {
      const clip = layer.clip ?? defaultLayerClip(durationSec);
      return layer.id === GLOBAL_LAYER_ID
        ? {
            ...layer,
            clip: { ...clip, startSec: 0, durationSec },
          }
        : { ...layer, clip: clampLayerClip(clip, durationSec) };
    }),
  };
}

function withAlgorithmSettings<
  K extends keyof MorphProject["algorithmSettings"],
>(
  project: MorphProject,
  key: K,
  patch: Partial<MorphProject["algorithmSettings"][K]>,
): MorphProject {
  return {
    ...project,
    algorithmSettings: {
      ...project.algorithmSettings,
      [key]: { ...project.algorithmSettings[key], ...patch },
    },
    updatedAt: now(),
  };
}

function placeVideoForSlot(
  slot: ImageSlot,
  video: LoadedVideo,
  videos: NonNullable<MorphProject["videos"]>,
): LoadedVideo {
  const source = videos.source;
  const target = videos.target;
  const startSec =
    slot === "target" && source
      ? source.timeline.startSec + source.timeline.durationSec
      : slot === "source" && target
        ? 0
        : video.asset.timeline.startSec;
  return {
    ...video,
    asset: {
      ...video.asset,
      timeline: normalizeVideoTimeline(
        { ...video.asset.timeline, startSec },
        video.asset.durationSec,
      ),
    },
  };
}

export const useProjectStore = create<ProjectState>((set) => ({
  source: null,
  target: null,
  sourceVideo: null,
  targetVideo: null,
  project: null,
  activeAlgorithm: "crossfade",

  setImage: (slot, image) =>
    set((s) => {
      const previousImage = slot === "source" ? s.source : s.target;
      const previousVideo = slot === "source" ? s.sourceVideo : s.targetVideo;
      if (previousImage?.bitmap !== image.bitmap) {
        disposeSlotMedia(previousImage, previousVideo);
      }
      const source = slot === "source" ? image : s.source;
      const target = slot === "target" ? image : s.target;
      const sourceVideo = slot === "source" ? null : s.sourceVideo;
      const targetVideo = slot === "target" ? null : s.targetVideo;
      let project = s.project;
      if (source && target) {
        project = project
          ? {
              ...project,
              images: { source: source.asset, target: target.asset },
              videos: {
                source: sourceVideo?.asset,
                target: targetVideo?.asset,
              },
              updatedAt: now(),
            }
          : {
              ...createProject(source.asset, target.asset),
              activeAlgorithm: s.activeAlgorithm,
            };
        project = projectWithTimelineBounds(project);
      }
      return { source, target, sourceVideo, targetVideo, project };
    }),

  setVideo: (slot, video) =>
    set((s) => {
      const previousImage = slot === "source" ? s.source : s.target;
      const previousVideo = slot === "source" ? s.sourceVideo : s.targetVideo;
      if (previousVideo?.element !== video.element) {
        disposeSlotMedia(previousImage, previousVideo);
      }
      const baseVideos = {
        source: slot === "source" ? video.asset : s.sourceVideo?.asset,
        target: slot === "target" ? video.asset : s.targetVideo?.asset,
      };
      const placedVideo = placeVideoForSlot(slot, video, baseVideos);
      const source = slot === "source" ? placedVideo.poster : s.source;
      const target = slot === "target" ? placedVideo.poster : s.target;
      const sourceVideo = slot === "source" ? placedVideo : s.sourceVideo;
      let targetVideo = slot === "target" ? placedVideo : s.targetVideo;
      let project = s.project;
      if (source && target) {
        if (!project && sourceVideo && targetVideo && slot === "source") {
          const targetStart =
            sourceVideo.asset.timeline.startSec +
            sourceVideo.asset.timeline.durationSec;
          targetVideo = {
            ...targetVideo,
            asset: {
              ...targetVideo.asset,
              timeline: normalizeVideoTimeline(
                { ...targetVideo.asset.timeline, startSec: targetStart },
                targetVideo.asset.durationSec,
              ),
            },
          };
        }
        const videos = {
          source: sourceVideo?.asset,
          target: targetVideo?.asset,
        };
        const projectDuration = project?.timeline.durationSec ?? 4;
        project = project
          ? {
              ...project,
              images: { source: source.asset, target: target.asset },
              videos,
              timeline: {
                ...project.timeline,
                durationSec: Math.max(
                  project.timeline.durationSec,
                  ...Object.values(videos)
                    .filter((item): item is NonNullable<typeof item> =>
                      Boolean(item),
                    )
                    .map(
                      (item) =>
                        item.timeline.startSec + item.timeline.durationSec,
                    ),
                ),
              },
              layers: project.layers.map((layer) => ({
                ...layer,
                clip: layer.clip ?? defaultLayerClip(projectDuration),
              })),
              updatedAt: now(),
            }
          : {
              ...createProject(source.asset, target.asset),
              activeAlgorithm: s.activeAlgorithm,
              videos,
            };
        project = projectWithTimelineBounds(project);
      }
      return { source, target, sourceVideo, targetVideo, project };
    }),

  relinkVideo: (slot, video) =>
    set((s) => {
      const savedVideo = s.project?.videos?.[slot];
      if (!s.project || !savedVideo) {
        throw new VideoRelinkError("no-saved-video");
      }
      const currentVideo = slot === "source" ? s.sourceVideo : s.targetVideo;
      if (currentVideo) throw new VideoRelinkError("already-linked");
      assertVideoRelinkCandidate(savedVideo, video.asset);

      const savedImage = s.project.images[slot];
      const runtimeVideo: LoadedVideo = {
        ...video,
        asset: {
          ...savedVideo,
          source: { kind: "object-url", value: video.objectUrl },
        },
        poster: {
          ...video.poster,
          asset: {
            ...savedImage,
            source: { kind: "object-url", value: video.objectUrl },
          },
        },
      };
      return {
        project: {
          ...s.project,
          images: {
            ...s.project.images,
            [slot]: runtimeVideo.poster.asset,
          },
          videos: {
            ...s.project.videos,
            [slot]: runtimeVideo.asset,
          },
        },
        [slot]: runtimeVideo.poster,
        [slot === "source" ? "sourceVideo" : "targetVideo"]: runtimeVideo,
      };
    }),

  updateVideoTimeline: (slot, timeline) =>
    set((s) => {
      if (!s.project) return s;
      const video = s.project.videos?.[slot];
      if (!video) return s;
      const nextVideo = {
        ...video,
        timeline: normalizeVideoTimelineToMaster(
          { ...video.timeline, ...timeline },
          video.durationSec,
          s.project.timeline.durationSec,
        ),
      };
      // Clip edits keep the saved montage duration and all other tracks.
      // Recomputing it from the source lengths makes a trimmed montage jump
      // in scale (and changes morph progress) on the first pointer movement.
      const project = {
        ...s.project,
        videos: {
          ...s.project.videos,
          [slot]: nextVideo,
        },
        updatedAt: now(),
      };
      const sourceVideo =
        slot === "source" && s.sourceVideo
          ? { ...s.sourceVideo, asset: nextVideo }
          : s.sourceVideo;
      const targetVideo =
        slot === "target" && s.targetVideo
          ? { ...s.targetVideo, asset: nextVideo }
          : s.targetVideo;
      return { project, sourceVideo, targetVideo };
    }),

  updateImageTimeline: (slot, patch) =>
    set((s) => {
      if (!s.project || s.project.videos?.[slot]) return s;
      if (Object.values(patch).some((value) => !Number.isFinite(value)))
        return s;
      const previous = s.project;
      const initial = imageTimelineForProject(previous, slot);
      const startSec = Math.min(
        PROJECT_LIMITS.timelineDurationSec - 0.001,
        Math.max(0, patch.startSec ?? initial.startSec),
      );
      const durationSec = Math.min(
        PROJECT_LIMITS.timelineDurationSec - startSec,
        Math.max(0.001, patch.durationSec ?? initial.durationSec),
      );
      // Freeze implicit image spans before growing the montage. Editing A must
      // not silently lengthen B. Keyframes on stills retain their master times.
      const images = { ...previous.images };
      for (const side of ["source", "target"] as const) {
        if (!previous.videos?.[side]) {
          images[side] = {
            ...images[side],
            timeline:
              side === slot
                ? { startSec, durationSec }
                : imageTimelineForProject(previous, side),
          };
        }
      }
      const total = Math.max(
        previous.timeline.durationSec,
        startSec + durationSec,
      );
      const project = {
        ...previous,
        images,
        timeline: { ...previous.timeline, durationSec: total },
        layers: previous.layers.map((layer) =>
          layer.id === GLOBAL_LAYER_ID && layer.clip
            ? {
                ...layer,
                clip: { ...layer.clip, startSec: 0, durationSec: total },
              }
            : layer,
        ),
        updatedAt: now(),
      };
      return {
        project,
        source: s.source ? { ...s.source, asset: images.source } : null,
        target: s.target ? { ...s.target, asset: images.target } : null,
      };
    }),

  setProject: (project) =>
    set((s) => {
      disposeAllMedia(s);
      return {
        project,
        source: null,
        target: null,
        sourceVideo: null,
        targetVideo: null,
        activeAlgorithm: project.activeAlgorithm,
      };
    }),

  loadProject: (project, images) =>
    set((s) => {
      disposeAllMedia(s);
      return {
        project,
        source: images?.source ?? null,
        target: images?.target ?? null,
        sourceVideo: null,
        targetVideo: null,
        activeAlgorithm: project.activeAlgorithm,
      };
    }),

  setAlgorithm: (activeAlgorithm) =>
    set((s) => ({
      activeAlgorithm,
      project: s.project
        ? { ...s.project, activeAlgorithm, updatedAt: now() }
        : s.project,
    })),

  setMeshSettings: (patch) =>
    set((s) =>
      s.project
        ? { project: withAlgorithmSettings(s.project, "mesh", patch) }
        : s,
    ),

  setTpsSettings: (patch) =>
    set((s) =>
      s.project
        ? {
            project: withAlgorithmSettings(s.project, "thinPlateSpline", patch),
          }
        : s,
    ),

  setBeierSettings: (patch) =>
    set((s) =>
      s.project
        ? { project: withAlgorithmSettings(s.project, "beierNeely", patch) }
        : s,
    ),

  addLayer: (layer) =>
    set((s) => {
      if (!s.project || !canAddUserLayer(s.project.layers)) return s;
      return {
        project: projectWithTimelineBounds({
          ...s.project,
          layers: [...s.project.layers, layer],
          updatedAt: now(),
        }),
      };
    }),

  updateLayer: (id, patch) =>
    set((s) => {
      if (!s.project) return s;
      const normalizedPatch = patch.clip
        ? {
            ...patch,
            clip: normalizeLayerClip(
              patch.clip,
              s.project.timeline.durationSec,
            ),
          }
        : patch;
      return {
        project: projectWithTimelineBounds({
          ...s.project,
          layers: s.project.layers.map((layer) =>
            layer.id === id
              ? { ...layer, ...normalizedPatch, id: layer.id }
              : layer,
          ),
          updatedAt: now(),
        }),
      };
    }),

  removeLayer: (id) =>
    set((s) => {
      if (!s.project || id === GLOBAL_LAYER_ID) return s;
      return {
        project: projectWithTimelineBounds({
          ...s.project,
          layers: s.project.layers.filter((layer) => layer.id !== id),
          features: s.project.features.map((feature) =>
            feature.layerId === id
              ? { ...feature, layerId: undefined }
              : feature,
          ),
          updatedAt: now(),
        }),
      };
    }),

  addFeature: (feature) =>
    set((s) =>
      s.project
        ? {
            project: {
              ...s.project,
              features: [...s.project.features, feature],
              updatedAt: now(),
            },
          }
        : s,
    ),

  updateFeature: (id, patch) =>
    set((s) => {
      if (!s.project) return s;
      const features = s.project.features.map((f) =>
        f.id === id ? ({ ...f, ...patch, updatedAt: now() } as FeaturePair) : f,
      );
      return { project: { ...s.project, features, updatedAt: now() } };
    }),

  removeFeature: (id) =>
    set((s) =>
      s.project
        ? {
            project: {
              ...s.project,
              features: s.project.features.filter((f) => f.id !== id),
              updatedAt: now(),
            },
          }
        : s,
    ),

  setFeatureLayer: (featureId, layerId) =>
    set((s) => {
      if (!s.project) return s;
      const layerExists =
        layerId === null ||
        s.project.layers.some((layer) => layer.id === layerId);
      if (!layerExists) return s;
      return {
        project: {
          ...s.project,
          features: s.project.features.map((feature) =>
            feature.id === featureId
              ? {
                  ...feature,
                  layerId:
                    layerId === null || layerId === GLOBAL_LAYER_ID
                      ? undefined
                      : layerId,
                  updatedAt: now(),
                }
              : feature,
          ),
          updatedAt: now(),
        },
      };
    }),

  setFeatures: (features) =>
    set((s) =>
      s.project ? { project: { ...s.project, features, updatedAt: now() } } : s,
    ),

  resetProject: () =>
    set((s) => {
      disposeAllMedia(s);
      return {
        source: null,
        target: null,
        sourceVideo: null,
        targetVideo: null,
        project: null,
        activeAlgorithm: "crossfade",
      };
    }),
}));

/** Releases resources when the application root is finally unmounted. */
export function disposeProjectStoreMedia(): void {
  disposeAllMedia(useProjectStore.getState());
}
