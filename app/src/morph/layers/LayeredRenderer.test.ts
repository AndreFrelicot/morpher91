import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MorphBackend, MorphFrame } from "@/morph/algorithms/MorphBackend";
import {
  createLayer,
  createPointFeature,
  createProject,
  defaultPlacement,
  featuresForLayer,
  type ImageAsset,
} from "@/morph/model";
import { LayeredRenderer } from "./LayeredRenderer";
import { MaskTextureCache } from "./MaskTextureCache";
import {
  baseLayerRenderSpec,
  compositeModeCode,
  renderableLayers,
} from "./layerRenderPlan";

const recordedFrames: MorphFrame[] = [];

vi.mock("@/morph/algorithms/backendFactory", () => ({
  createBackend: (id: string): MorphBackend => ({
    id: id as MorphBackend["id"],
    renderFrame: (frame: MorphFrame) => {
      recordedFrames.push({ ...frame });
    },
    dispose: () => {},
  }),
}));

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

describe("LayeredRenderer helpers", () => {
  it("uses the Global layer algorithm and features for the base render", () => {
    const project = createProject(image("a"), image("b"));
    project.activeAlgorithm = "mesh";
    const globalPoint = createPointFeature({ x: 0.2, y: 0.3 });
    project.features = [globalPoint];

    const base = baseLayerRenderSpec(project, 2);

    expect(base.layer.id).toBe("global");
    expect(base.algorithm).toBe("mesh");
    expect(base.warpT).toBeCloseTo(0.5);
    expect(base.dissolveT).toBeCloseTo(0.5);
    expect(base.layer.featureIds).toBe("all");
    expect(featuresForLayer(project, base.layer)).toEqual([globalPoint]);
  });

  it("keeps a forced algorithm ahead of the Global project default", () => {
    const project = createProject(image("a"), image("b"));
    project.activeAlgorithm = "mesh";

    const base = baseLayerRenderSpec(project, 2, "thin-plate-spline");

    expect(base.algorithm).toBe("thin-plate-spline");
    expect(base.forcedAlgorithm).toBe("thin-plate-spline");
  });

  it("sorts enabled and visible layers for rendering", () => {
    const project = createProject(image("a"), image("b"));
    project.layers.push(createLayer("Top", 3));
    project.layers.push({ ...createLayer("Hidden", 1), visible: false });
    const face = createLayer("Face", 2);
    const top = project.layers.find((layer) => layer.name === "Top")!;
    const facePoint = createPointFeature({ x: 0.2, y: 0.2 });
    const topPoint = createPointFeature({ x: 0.8, y: 0.8 });
    facePoint.layerId = face.id;
    topPoint.layerId = top.id;
    project.features = [facePoint, topPoint];
    project.layers.push(face);
    project.layers.push({ ...createLayer("Disabled", 4), enabled: false });

    expect(renderableLayers(project).map((layer) => layer.name)).toEqual([
      "Global",
      "Face",
      "Top",
    ]);
  });

  it("maps layer blend modes to shader constants", () => {
    expect(compositeModeCode("normal")).toBe(0);
    expect(compositeModeCode("source-over")).toBe(0);
    expect(compositeModeCode("multiply")).toBe(2);
    expect(compositeModeCode("screen")).toBe(3);
    expect(compositeModeCode("lighter")).toBe(4);
  });

  it("reuses working textures for 120 stable frames and releases ownership", () => {
    const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
    const textures: {
      createView: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    }[] = [];
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
      end: vi.fn(),
    };
    const createRenderPipeline = vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({})),
    }));
    const device = {
      createSampler: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({})),
      createRenderPipeline,
      createBuffer: vi.fn(() => {
        const buffer = { destroy: vi.fn() };
        buffers.push(buffer);
        return buffer;
      }),
      createTexture: vi.fn(() => {
        const texture = {
          createView: vi.fn(() => ({})),
          destroy: vi.fn(),
        };
        textures.push(texture);
        return texture;
      }),
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: vi.fn(() => ({
        beginRenderPass: vi.fn(() => pass),
        finish: vi.fn(() => ({})),
      })),
      queue: {
        writeBuffer: vi.fn(),
        writeTexture: vi.fn(),
        submit: vi.fn(),
      },
    } as unknown as GPUDevice;
    const project = createProject(image("a"), image("b"));
    const view = {} as GPUTextureView;
    const frame = {
      project,
      target: view,
      a: { view, width: 512, height: 512 },
      b: { view, width: 512, height: 512 },
      canvasWidth: 512,
      canvasHeight: 512,
      t: 0.5,
    };
    const renderer = new LayeredRenderer(device, "rgba8unorm");
    renderer.renderFrame(frame);
    const allocatedTextures = textures.length;
    const allocatedBuffers = buffers.length;

    for (let index = 0; index < 120; index++) renderer.renderFrame(frame);

    expect(textures).toHaveLength(allocatedTextures);
    expect(buffers).toHaveLength(allocatedBuffers);

    project.activeAlgorithm = "mesh";
    renderer.renderFrame(frame, {
      algorithm: "crossfade",
      debugMode: "layer-mask",
      debugLayerId: "global",
    });
    const pipelinesAfterFirstMask = createRenderPipeline.mock.calls.length;
    renderer.renderFrame(frame, {
      algorithm: "crossfade",
      debugMode: "layer-mask",
      debugLayerId: "global",
    });
    expect(createRenderPipeline).toHaveBeenCalledTimes(pipelinesAfterFirstMask);

    renderer.dispose();
    expect(
      textures.every((texture) => texture.destroy.mock.calls.length === 1),
    ).toBe(true);
    expect(
      buffers.every((buffer) => buffer.destroy.mock.calls.length === 1),
    ).toBe(true);
  });

  it("drives backends with warpT and dissolveT, and masks with warpT", () => {
    recordedFrames.length = 0;
    const maskFor = vi.spyOn(MaskTextureCache.prototype, "maskFor");
    const project = createProject(image("a"), image("b"));
    project.timeline.durationSec = 10;
    project.layers[0].clip = { startSec: 0, durationSec: 10 };
    const layer = createLayer("Face", 1);
    layer.clip = { startSec: 0, durationSec: 10 };
    layer.timing = {
      warpStart: 0,
      warpEnd: 1,
      dissolveStart: 0.4,
      dissolveEnd: 0.6,
      easing: "linear",
    };
    const point = createPointFeature({ x: 0.2, y: 0.3 });
    point.layerId = layer.id;
    project.features = [point];
    project.layers.push(layer);

    const view = {} as GPUTextureView;
    const renderer = new LayeredRenderer(stubDevice(), "rgba8unorm");
    renderer.renderFrame({
      project,
      target: view,
      a: { view, width: 512, height: 512 },
      b: { view, width: 512, height: 512 },
      canvasWidth: 512,
      canvasHeight: 512,
      t: 0.3,
      tauSec: 3,
    });

    // [0] = Global base (default 0..1 windows), [1] = the windowed user layer.
    expect(recordedFrames).toHaveLength(2);
    expect(recordedFrames[0].t).toBeCloseTo(recordedFrames[0].dissolveT!);
    expect(recordedFrames[1].t).toBeCloseTo(0.3);
    expect(recordedFrames[1].dissolveT).toBe(0);
    expect(maskFor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: layer.id }),
      0.3,
      512,
      512,
    );

    maskFor.mockRestore();
    renderer.dispose();
  });
});

/** Minimal WebGPU device stub: every object the renderer builds is inert. */
function stubDevice(): GPUDevice {
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };
  return {
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
    createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => pass),
      finish: vi.fn(() => ({})),
    })),
    queue: {
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;
}

beforeAll(() => {
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2 });
});
