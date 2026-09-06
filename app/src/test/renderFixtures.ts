import {
  createLayer,
  createPointFeature,
  createProject,
  createRegionFeature,
  defaultPlacement,
  encodeMaskBytes,
  type ImageAsset,
  type MorphProject,
  type VideoAsset,
  type VideoTimeline,
} from "@/morph/model";

export function renderFixtureImage(
  name: string,
  width = 64,
  height = 64,
): ImageAsset {
  return {
    id: `image-${name}`,
    name: `${name}.png`,
    width,
    height,
    source: { kind: "bundled", value: `${name}.png` },
    placement: defaultPlacement(),
  };
}

export function renderFixtureVideo(
  name: string,
  timeline: VideoTimeline,
): VideoAsset {
  return {
    id: `video-${name}`,
    name: `${name}.mp4`,
    width: 64,
    height: 64,
    durationSec: timeline.inSec + timeline.durationSec,
    source: { kind: "external-video-placeholder", value: `${name}.mp4` },
    timeline,
  };
}

export function imageImageRenderFixture(): MorphProject {
  return createProject(
    renderFixtureImage("source"),
    renderFixtureImage("target"),
    "Image parity fixture",
  );
}

export function videoImageRenderFixture(): MorphProject {
  const project = imageImageRenderFixture();
  project.name = "Video/image parity fixture";
  project.videos = {
    source: renderFixtureVideo("source", {
      startSec: 1,
      inSec: 0.25,
      durationSec: 2,
    }),
  };
  project.timeline.durationSec = 4;
  return project;
}

/**
 * One compact adversarial project covering staggered clips, a timeline gap,
 * independent layer backends, and both vector and painted masks.
 */
export function layeredGapRenderFixture(): MorphProject {
  const project = imageImageRenderFixture();
  project.name = "Layered gap parity fixture";
  project.videos = {
    source: renderFixtureVideo("source", {
      startSec: 1,
      inSec: 0,
      durationSec: 2,
    }),
    target: renderFixtureVideo("target", {
      startSec: 4,
      inSec: 0,
      durationSec: 2,
    }),
  };
  project.timeline.durationSec = 7;

  const vectorLayer = createLayer("Vector mask", 1);
  const paintedLayer = createLayer("Painted mask", 2);
  const vectorPoint = createPointFeature({ x: 0.25, y: 0.4 });
  const paintedPoint = createPointFeature({ x: 0.7, y: 0.6 });
  const region = createRegionFeature([
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.5, y: 0.9 },
  ]);

  vectorPoint.layerId = vectorLayer.id;
  paintedPoint.layerId = paintedLayer.id;
  vectorLayer.featureIds = [vectorPoint.id];
  vectorLayer.mask = { featureId: region.id, mode: "feathered", feather: 0.1 };
  paintedLayer.featureIds = [paintedPoint.id];
  paintedLayer.paintedMask = {
    width: 2,
    height: 2,
    data: encodeMaskBytes(new Uint8Array([0, 64, 128, 255])),
  };

  project.features = [region, vectorPoint, paintedPoint];
  project.layers.push(vectorLayer, paintedLayer);
  return project;
}
