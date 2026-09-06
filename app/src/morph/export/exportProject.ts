import {
  computeUvTransform,
  type UvTransform,
} from "@/lib/image/imagePlacement";
import type {
  ExportResolutionPreset,
  FeaturePair,
  MorphProject,
  NormalizedVec2,
} from "@/morph/model";
import type { ExportDimensions } from "./exportDimensions";

export type ExportImageDimensions = {
  source: ExportDimensions;
  target: ExportDimensions;
};

function projectToImageUv(p: NormalizedVec2, t: UvTransform): NormalizedVec2 {
  return {
    x: p.x * t.scaleX + t.offsetX,
    y: p.y * t.scaleY + t.offsetY,
  };
}

function imageUvToProject(p: NormalizedVec2, t: UvTransform): NormalizedVec2 {
  return {
    x: (p.x - t.offsetX) / t.scaleX,
    y: (p.y - t.offsetY) / t.scaleY,
  };
}

function remapPoint(p: NormalizedVec2, from: UvTransform, to: UvTransform) {
  return imageUvToProject(projectToImageUv(p, from), to);
}

function remapFeature(
  feature: FeaturePair,
  sourceFrom: UvTransform,
  sourceTo: UvTransform,
  targetFrom: UvTransform,
  targetTo: UvTransform,
): FeaturePair {
  const a = (p: NormalizedVec2) => remapPoint(p, sourceFrom, sourceTo);
  const b = (p: NormalizedVec2) => remapPoint(p, targetFrom, targetTo);

  switch (feature.kind) {
    case "point":
      return { ...feature, a: a(feature.a), b: b(feature.b) };
    case "segment":
      return {
        ...feature,
        a0: a(feature.a0),
        a1: a(feature.a1),
        b0: b(feature.b0),
        b1: b(feature.b1),
      };
    case "polyline":
    case "region":
      return {
        ...feature,
        a: feature.a.map(a),
        b: feature.b.map(b),
      };
  }
}

export function projectForExportResolution({
  project,
  preset,
  dimensions,
  images,
  displayImages = images,
}: {
  project: MorphProject;
  preset: ExportResolutionPreset;
  dimensions: ExportDimensions;
  images: ExportImageDimensions;
  displayImages?: ExportImageDimensions;
}): MorphProject {
  if (preset !== "source" && preset !== "target") {
    return project;
  }

  const sourceFrom = computeUvTransform(
    project.canvas.width,
    project.canvas.height,
    displayImages.source.width,
    displayImages.source.height,
    "contain",
  );
  const targetFrom = computeUvTransform(
    project.canvas.width,
    project.canvas.height,
    displayImages.target.width,
    displayImages.target.height,
    "contain",
  );
  const sourceTo = computeUvTransform(
    dimensions.width,
    dimensions.height,
    images.source.width,
    images.source.height,
    "contain",
  );
  const targetTo = computeUvTransform(
    dimensions.width,
    dimensions.height,
    images.target.width,
    images.target.height,
    "contain",
  );

  return {
    ...project,
    canvas: {
      ...project.canvas,
      aspectRatio: "custom",
      width: dimensions.width,
      height: dimensions.height,
    },
    images: {
      source: {
        ...project.images.source,
        width: images.source.width,
        height: images.source.height,
      },
      target: {
        ...project.images.target,
        width: images.target.width,
        height: images.target.height,
      },
    },
    features: project.features.map((feature) =>
      remapFeature(feature, sourceFrom, sourceTo, targetFrom, targetTo),
    ),
  };
}
