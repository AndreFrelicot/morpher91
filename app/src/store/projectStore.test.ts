import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLayer,
  createPointFeature,
  createProject,
  defaultPlacement,
  defaultVideoTimeline,
  MAX_USER_LAYERS,
  parseProjectV1,
  serializeProject,
  type ImageAsset,
  type VideoAsset,
} from "@/morph/model";
import type { LoadedImage } from "@/lib/image/loadImage";
import type { LoadedVideo } from "@/lib/video/loadVideo";
import {
  hasMissingProjectVideos,
  missingProjectVideoSlots,
  useProjectStore,
} from "./projectStore";

function image(name: string): ImageAsset {
  return {
    id: name,
    name,
    width: 512,
    height: 512,
    source: { kind: "bundled", value: name },
    placement: defaultPlacement(),
  };
}

function loadedVideo(
  name: string,
  durationSec: number,
  patch: Partial<VideoAsset> = {},
): LoadedVideo {
  const asset: VideoAsset = {
    id: name,
    name,
    width: 1280,
    height: 720,
    durationSec,
    fingerprint: `${name}:100:123`,
    source: { kind: "object-url", value: `blob:${name}` },
    timeline: defaultVideoTimeline(durationSec),
    ...patch,
  };
  const poster = {
    asset: image(`${name}.poster`),
    bitmap: {
      close: vi.fn(),
      width: 1280,
      height: 720,
    } as unknown as ImageBitmap,
  };
  return {
    asset,
    poster,
    objectUrl: `blob:${name}`,
    element: {
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLVideoElement,
  };
}

function loadedImage(name: string): LoadedImage {
  return {
    asset: image(name),
    bitmap: {
      close: vi.fn(),
      width: 512,
      height: 512,
    } as unknown as ImageBitmap,
  };
}

beforeEach(() => {
  useProjectStore.setState({
    source: null,
    target: null,
    sourceVideo: null,
    targetVideo: null,
    activeAlgorithm: "crossfade",
    project: createProject(image("a"), image("b")),
  });
});

describe("projectStore layers", () => {
  it("patches each algorithm settings group without replacing siblings", () => {
    const before = useProjectStore.getState().project!.algorithmSettings;

    useProjectStore.getState().setMeshSettings({ showWireframe: true });
    useProjectStore.getState().setTpsSettings({ lambda: 0.25 });
    useProjectStore.getState().setBeierSettings({ maxLines: 12 });

    const after = useProjectStore.getState().project!.algorithmSettings;
    expect(after.mesh).toMatchObject({
      ...before.mesh,
      showWireframe: true,
    });
    expect(after.thinPlateSpline).toMatchObject({
      ...before.thinPlateSpline,
      lambda: 0.25,
    });
    expect(after.beierNeely).toMatchObject({
      ...before.beierNeely,
      maxLines: 12,
    });
  });

  it("disposes a replaced static image exactly once", () => {
    const first = loadedImage("first");
    const second = loadedImage("second");
    useProjectStore.setState({ source: first });

    useProjectStore.getState().setImage("source", second);
    useProjectStore.getState().setImage("source", second);

    expect(first.bitmap.close).toHaveBeenCalledTimes(1);
    expect(second.bitmap.close).not.toHaveBeenCalled();
  });

  it("lets a video own and release its exposed poster", () => {
    const video = loadedVideo("source.mov", 6);
    const replacement = loadedImage("replacement");
    useProjectStore.setState({
      source: video.poster,
      sourceVideo: video,
    });

    useProjectStore.getState().setImage("source", replacement);
    useProjectStore.getState().resetProject();

    expect(video.element.pause).toHaveBeenCalledTimes(1);
    expect(video.poster.bitmap.close).toHaveBeenCalledTimes(1);
    expect(replacement.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("releases both slots and restores project defaults on reset", () => {
    const source = loadedImage("source");
    const target = loadedImage("target");
    useProjectStore.setState({
      source,
      target,
      activeAlgorithm: "mesh",
    });

    useProjectStore.getState().resetProject();
    useProjectStore.getState().resetProject();

    expect(source.bitmap.close).toHaveBeenCalledTimes(1);
    expect(target.bitmap.close).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState()).toMatchObject({
      source: null,
      target: null,
      sourceVideo: null,
      targetVideo: null,
      project: null,
      activeAlgorithm: "crossfade",
    });
  });

  it("adds user layers up to the light M8 cap", () => {
    for (let i = 0; i < MAX_USER_LAYERS + 1; i++) {
      useProjectStore.getState().addLayer(createLayer(`Layer ${i}`, i + 1));
    }

    expect(useProjectStore.getState().project!.layers).toHaveLength(
      MAX_USER_LAYERS + 1,
    );
  });

  it("updates layers without allowing id replacement", () => {
    const layer = createLayer("Face", 1);
    useProjectStore.getState().addLayer(layer);

    useProjectStore.getState().updateLayer(layer.id, {
      id: "other",
      name: "Updated",
    });

    const updated = useProjectStore
      .getState()
      .project!.layers.find((x) => x.id === layer.id);
    expect(updated?.name).toBe("Updated");
    expect(updated?.id).toBe(layer.id);
  });

  it("assigns features to layers and clears the assignment when removed", () => {
    const layer = createLayer("Face", 1);
    const feature = createPointFeature({ x: 0.5, y: 0.5 });
    useProjectStore.getState().addLayer(layer);
    useProjectStore.getState().addFeature(feature);
    useProjectStore.getState().setFeatureLayer(feature.id, layer.id);
    expect(useProjectStore.getState().project!.features[0].layerId).toBe(
      layer.id,
    );

    useProjectStore.getState().removeLayer(layer.id);
    expect(useProjectStore.getState().project!.features[0].layerId).toBe(
      undefined,
    );
  });

  it("does not remove the global layer", () => {
    useProjectStore.getState().removeLayer("global");
    expect(useProjectStore.getState().project!.layers).toHaveLength(1);
    expect(useProjectStore.getState().project!.layers[0].id).toBe("global");
  });

  it("loads hydrated project images and restores the active algorithm", () => {
    const project = createProject(image("source"), image("target"));
    project.activeAlgorithm = "mesh";
    const source = { asset: project.images.source, bitmap: {} as ImageBitmap };
    const target = { asset: project.images.target, bitmap: {} as ImageBitmap };

    useProjectStore.getState().loadProject(project, { source, target });

    expect(useProjectStore.getState().project).toBe(project);
    expect(useProjectStore.getState().source).toBe(source);
    expect(useProjectStore.getState().target).toBe(target);
    expect(useProjectStore.getState().activeAlgorithm).toBe("mesh");
  });

  it("sets global videos without embedding them into image slots", () => {
    const source = loadedVideo("source.mov", 6);
    const target = loadedVideo("target.mov", 8);

    useProjectStore.getState().setVideo("source", source);
    useProjectStore.getState().setVideo("target", target);

    const state = useProjectStore.getState();
    expect(state.sourceVideo?.objectUrl).toBe(source.objectUrl);
    expect(state.targetVideo?.objectUrl).toBe(target.objectUrl);
    expect(state.source).toBe(source.poster);
    expect(state.target).toBe(target.poster);
    expect(state.project?.videos?.source?.name).toBe("source.mov");
    expect(state.project?.videos?.source?.timeline.startSec).toBe(0);
    expect(state.project?.videos?.target?.timeline.startSec).toBe(6);
    expect(state.project?.timeline.durationSec).toBe(14);
    expect(state.project?.layers[0].clip?.durationSec).toBe(14);
  });

  it("clamps user layers and feature tracks when the master timeline shrinks", () => {
    useProjectStore.setState({ target: loadedImage("target") });
    useProjectStore.getState().setVideo("source", loadedVideo("long.mov", 10));
    const layer = createLayer("Late", 1);
    layer.clip = { startSec: 5, durationSec: 2 };
    const feature = createPointFeature({ x: 0.25, y: 0.5 });
    feature.tracks = {
      a: [{ timeSec: 8, pos: { x: 0.5, y: 0.5 } }],
      b: [
        { timeSec: 2, pos: { x: 0.25, y: 0.5 } },
        { timeSec: 8, pos: { x: 0.75, y: 0.5 } },
      ],
    };
    const sparseFeature = createPointFeature({ x: 0.5, y: 0.25 });
    sparseFeature.tracks = {
      a: undefined,
      b: [{ timeSec: 8, pos: { x: 0.5, y: 0.75 } }],
    };
    useProjectStore.getState().addLayer(layer);
    useProjectStore.getState().addFeature(feature);
    useProjectStore.getState().addFeature(sparseFeature);

    useProjectStore.getState().setVideo("source", loadedVideo("short.mov", 3));

    const project = useProjectStore.getState().project!;
    expect(project.timeline.durationSec).toBe(3);
    expect(project.layers.find((item) => item.id === layer.id)?.clip).toEqual({
      startSec: 1,
      durationSec: 2,
    });
    expect(project.features[0].tracks).toEqual({
      a: [{ timeSec: 3, pos: { x: 0.5, y: 0.5 } }],
      b: [{ timeSec: 2, pos: { x: 0.25, y: 0.5 } }],
    });
    expect(project.features[1].tracks).toEqual({
      a: undefined,
      b: [{ timeSec: 3, pos: { x: 0.5, y: 0.75 } }],
    });
    expect(() =>
      parseProjectV1(JSON.parse(JSON.stringify(serializeProject(project)))),
    ).not.toThrow();
  });

  it("reapplies timeline bounds when a video slot becomes an image", () => {
    useProjectStore.setState({ target: loadedImage("target") });
    useProjectStore
      .getState()
      .setVideo("source", loadedVideo("source.mov", 10));
    useProjectStore.getState().setVideo("target", loadedVideo("target.mov", 3));

    useProjectStore.getState().setImage("source", loadedImage("still.png"));

    const project = useProjectStore.getState().project!;
    expect(project.timeline.durationSec).toBe(3);
    expect(project.videos?.target?.timeline).toEqual({
      startSec: 0,
      inSec: 0,
      durationSec: 3,
    });
    expect(() =>
      parseProjectV1(JSON.parse(JSON.stringify(serializeProject(project)))),
    ).not.toThrow();
  });

  it("caps the master timeline at the project validation limit", () => {
    useProjectStore.setState({ target: loadedImage("target") });
    useProjectStore
      .getState()
      .setVideo("source", loadedVideo("source.mov", 2_000));
    useProjectStore
      .getState()
      .setVideo("target", loadedVideo("target.mov", 2_000));

    const project = useProjectStore.getState().project!;
    expect(project.timeline.durationSec).toBe(3_600);
    expect(project.videos?.target?.timeline).toEqual({
      startSec: 1_600,
      inSec: 0,
      durationSec: 2_000,
    });
    expect(() =>
      parseProjectV1(JSON.parse(JSON.stringify(serializeProject(project)))),
    ).not.toThrow();
  });

  it("updates video clips without stretching local video time", () => {
    const source = loadedVideo("source.mov", 6);
    const target = loadedVideo("target.mov", 8);

    useProjectStore.getState().setVideo("source", source);
    useProjectStore.getState().setVideo("target", target);
    useProjectStore.getState().updateVideoTimeline("target", {
      startSec: 2,
      inSec: 1,
      durationSec: 3,
    });

    const state = useProjectStore.getState();
    expect(state.project?.videos?.target?.timeline).toEqual({
      startSec: 2,
      inSec: 1,
      durationSec: 3,
    });
    expect(state.targetVideo?.asset.timeline).toEqual({
      startSec: 2,
      inSec: 1,
      durationSec: 3,
    });
    expect(state.project?.timeline.durationSec).toBe(14);
  });

  it("keeps a saved trimmed montage stable while moving either clip", () => {
    const source = loadedVideo("source.mov", 8);
    const target = loadedVideo("target.mov", 8);
    const project = createProject(source.poster.asset, target.poster.asset);
    project.videos = {
      source: {
        ...source.asset,
        timeline: { startSec: 0, inSec: 4, durationSec: 3 },
      },
      target: {
        ...target.asset,
        timeline: { startSec: 0, inSec: 4, durationSec: 3 },
      },
    };
    const point = createPointFeature({ x: 0.5, y: 0.5 });
    point.tracks = {
      a: [{ timeSec: 7, pos: point.a }],
      b: [{ timeSec: 7, pos: point.b }],
    };
    project.features = [point];
    useProjectStore.setState({
      project,
      source: source.poster,
      target: target.poster,
      sourceVideo: source,
      targetVideo: target,
    });
    for (const slot of ["source", "target"] as const) {
      useProjectStore.getState().updateVideoTimeline(slot, { startSec: 0.5 });
      const state = useProjectStore.getState();
      expect(state.project!.timeline.durationSec).toBe(4);
      expect(state.project!.features).toBe(project.features);
      expect(state.project!.layers).toBe(project.layers);
      expect(
        state[slot === "source" ? "sourceVideo" : "targetVideo"]!.asset
          .timeline,
      ).toEqual(state.project!.videos![slot]!.timeline);
    }
    expect(() =>
      parseProjectV1(serializeProject(useProjectStore.getState().project!)),
    ).not.toThrow();
  });

  it("keeps video clips inside the fixed master timeline", () => {
    const source = loadedVideo("source.mov", 6);
    const target = loadedVideo("target.mov", 8);

    useProjectStore.getState().setVideo("source", source);
    useProjectStore.getState().setVideo("target", target);
    useProjectStore.getState().updateVideoTimeline("target", {
      startSec: 20,
      inSec: 0,
      durationSec: 8,
    });

    const state = useProjectStore.getState();
    expect(state.project?.timeline.durationSec).toBe(14);
    expect(state.project?.videos?.target?.timeline).toEqual({
      startSec: 6,
      inSec: 0,
      durationSec: 8,
    });
  });

  it("places initial video clips sequentially even when target loads first", () => {
    useProjectStore.setState({
      source: null,
      target: null,
      sourceVideo: null,
      targetVideo: null,
      activeAlgorithm: "crossfade",
      project: null,
    });
    const source = loadedVideo("source.mov", 6);
    const target = loadedVideo("target.mov", 8);

    useProjectStore.getState().setVideo("target", target);
    useProjectStore.getState().setVideo("source", source);

    const state = useProjectStore.getState();
    expect(state.project?.videos?.source?.timeline.startSec).toBe(0);
    expect(state.project?.videos?.target?.timeline.startSec).toBe(6);
    expect(state.project?.timeline.durationSec).toBe(14);
  });

  it("loads video placeholders as missing and relinks them in either order", () => {
    const project = createProject(image("saved-a"), image("saved-b"));
    const savedSource = loadedVideo("source.mov", 6).asset;
    const savedTarget = loadedVideo("target.mov", 8).asset;
    savedTarget.timeline = { startSec: 6, inSec: 1, durationSec: 7 };
    project.videos = {
      source: {
        ...savedSource,
        source: {
          kind: "external-video-placeholder",
          value: savedSource.name,
        },
      },
      target: {
        ...savedTarget,
        source: {
          kind: "external-video-placeholder",
          value: savedTarget.name,
        },
      },
    };
    const originalFeatures = project.features;
    const originalLayers = project.layers;

    useProjectStore.getState().loadProject(project);
    expect(missingProjectVideoSlots(useProjectStore.getState())).toEqual([
      "source",
      "target",
    ]);

    const renamedTarget = loadedVideo("renamed-target.mov", 8, {
      fingerprint: "different",
    });
    useProjectStore.getState().relinkVideo("target", renamedTarget);
    expect(missingProjectVideoSlots(useProjectStore.getState())).toEqual([
      "source",
    ]);

    const sourceCandidate = loadedVideo("source.mov", 6, {
      width: 1,
      height: 1,
      durationSec: 1,
      fingerprint: savedSource.fingerprint,
    });
    useProjectStore.getState().relinkVideo("source", sourceCandidate);

    const state = useProjectStore.getState();
    expect(hasMissingProjectVideos(state)).toBe(false);
    expect(state.sourceVideo?.asset).toMatchObject({
      id: savedSource.id,
      name: savedSource.name,
      timeline: savedSource.timeline,
      fingerprint: savedSource.fingerprint,
      source: { kind: "object-url", value: sourceCandidate.objectUrl },
    });
    expect(state.targetVideo?.asset).toMatchObject({
      id: savedTarget.id,
      name: savedTarget.name,
      timeline: savedTarget.timeline,
    });
    expect(state.source?.asset.id).toBe(project.images.source.id);
    expect(state.target?.asset.id).toBe(project.images.target.id);
    expect(state.project?.features).toBe(originalFeatures);
    expect(state.project?.layers).toBe(originalLayers);
  });

  it("rejects a relink mismatch without a partial store mutation", () => {
    const project = createProject(image("saved-a"), image("saved-b"));
    const saved = loadedVideo("source.mov", 6).asset;
    project.videos = {
      source: {
        ...saved,
        source: { kind: "external-video-placeholder", value: saved.name },
      },
    };
    useProjectStore.getState().loadProject(project);
    const before = useProjectStore.getState();

    expect(() =>
      useProjectStore
        .getState()
        .relinkVideo(
          "source",
          loadedVideo("wrong.mov", 2, { width: 320, height: 240 }),
        ),
    ).toThrow(expect.objectContaining({ code: "mismatch" }));

    expect(useProjectStore.getState()).toBe(before);
    expect(hasMissingProjectVideos(useProjectStore.getState())).toBe(true);
  });
});

describe("still-image clips", () => {
  it("extends the montage without stretching the other image or retiming keys", () => {
    const store = useProjectStore.getState();
    const feature = createPointFeature({ x: 0.2, y: 0.4 });
    feature.tracks = { a: [{ timeSec: 2, pos: feature.a }] };
    store.addFeature(feature);
    store.updateImageTimeline("source", { startSec: 1, durationSec: 12 });
    let project = useProjectStore.getState().project!;
    expect(project.timeline.durationSec).toBe(13);
    expect(project.images.target.timeline).toEqual({
      startSec: 0,
      durationSec: 4,
    });
    expect(project.features[0].tracks).toEqual(feature.tracks);
    expect(
      parseProjectV1(serializeProject(project)).images.source.timeline,
    ).toEqual({ startSec: 1, durationSec: 12 });
    store.updateImageTimeline("source", { durationSec: 2 });
    project = useProjectStore.getState().project!;
    expect(project.timeline.durationSec).toBe(13);
    expect(project.images.source.timeline).toEqual({
      startSec: 1,
      durationSec: 2,
    });
  });

  it("preserves a long still when changing the other video clip", () => {
    useProjectStore.setState({ target: loadedImage("target") });
    useProjectStore.getState().setVideo("source", loadedVideo("short.mov", 3));
    useProjectStore
      .getState()
      .updateImageTimeline("target", { durationSec: 20 });
    useProjectStore
      .getState()
      .updateVideoTimeline("source", { startSec: 2, durationSec: 1 });
    const project = useProjectStore.getState().project!;
    expect(project.timeline.durationSec).toBe(20);
    expect(project.images.target.timeline?.durationSec).toBe(20);
    expect(parseProjectV1(serializeProject(project)).timeline.durationSec).toBe(
      20,
    );
  });

  it("bounds image clips and ignores nonfinite inputs", () => {
    useProjectStore
      .getState()
      .updateImageTimeline("source", { startSec: -5, durationSec: 4000 });
    const project = useProjectStore.getState().project!;
    expect(project.images.source.timeline).toEqual({
      startSec: 0,
      durationSec: 3600,
    });
    useProjectStore
      .getState()
      .updateImageTimeline("source", { durationSec: NaN });
    expect(useProjectStore.getState().project).toBe(project);
  });
});
