import type { ImageAsset } from "./image";
import type { MorphProject } from "./project";
import type { VideoAsset } from "./video";
import { parseProjectV1, ProjectFileError } from "./projectValidation";

/**
 * Serializable project document (PRD §16.1). Same shape as MorphProject.
 * Current local imports store their bytes as `data-url` sources, so JSON save
 * embeds the image data. Legacy runtime-only sources still become placeholders.
 */
export type SerializedMorphProject = MorphProject;

const placeholderSource = (asset: ImageAsset): ImageAsset["source"] =>
  asset.source.kind === "object-url" || asset.source.kind === "indexed-db"
    ? { kind: "external-file-placeholder", value: asset.name }
    : asset.source;

const serializeImage = (asset: ImageAsset): ImageAsset => ({
  ...asset,
  source: placeholderSource(asset),
});

const serializeVideo = (asset: VideoAsset): VideoAsset => {
  return {
    ...asset,
    source: { kind: "external-video-placeholder", value: asset.name },
  };
};

export function serializeProject(
  project: MorphProject,
): SerializedMorphProject {
  return {
    ...project,
    images: {
      source: serializeImage(project.images.source),
      target: serializeImage(project.images.target),
    },
    videos: project.videos
      ? {
          source: project.videos.source
            ? serializeVideo(project.videos.source)
            : undefined,
          target: project.videos.target
            ? serializeVideo(project.videos.target)
            : undefined,
        }
      : undefined,
  };
}

/** Parses + validates a saved project. Throws on unknown shape/version. */
export function deserializeProject(json: string): MorphProject {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectFileError("invalid-json");
  }
  return parseProjectV1(data);
}
