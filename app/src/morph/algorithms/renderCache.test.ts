import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPointFeature,
  createProject,
  createSegmentFeature,
  defaultPlacement,
  type ImageAsset,
  type MorphProject,
} from "@/morph/model";
import type { MorphFrame } from "./MorphBackend";
import { MeshBackend } from "./mesh/MeshBackend";
import { TpsBackend } from "./tps/TpsBackend";
import { BeierBackend } from "./beier/BeierBackend";
import {
  readRenderDiagnostics,
  resetRenderDiagnostics,
} from "./renderDiagnostics";

beforeAll(() => {
  vi.stubGlobal("GPUBufferUsage", {
    STORAGE: 1,
    COPY_DST: 2,
    UNIFORM: 4,
    VERTEX: 8,
    INDEX: 16,
  });
});

beforeEach(resetRenderDiagnostics);

function fakeDevice() {
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  };
  const device = {
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
      submit: vi.fn(),
    },
  };
  return device as unknown as GPUDevice & typeof device;
}

const image = (name: string): ImageAsset => ({
  id: name,
  name,
  width: 256,
  height: 256,
  source: { kind: "bundled", value: name },
  placement: defaultPlacement(),
});

function project(): MorphProject {
  const result = createProject(image("a"), image("b"));
  result.features = [
    createPointFeature({ x: 0.2, y: 0.2 }, { x: 0.25, y: 0.2 }),
    createPointFeature({ x: 0.8, y: 0.2 }, { x: 0.75, y: 0.2 }),
    createPointFeature({ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.75 }),
  ];
  return result;
}

function frame(projectValue: MorphProject): MorphFrame {
  const view = {} as GPUTextureView;
  return {
    project: projectValue,
    target: view,
    a: { view, width: 256, height: 256 },
    b: { view, width: 256, height: 256 },
    canvasWidth: 256,
    canvasHeight: 256,
    t: 0.5,
  };
}

describe("algorithm cache diagnostics", () => {
  it("keeps TPS solves independent between layer backend instances", () => {
    const device = fakeDevice();
    const face = new TpsBackend(device, "rgba8unorm");
    const hair = new TpsBackend(device, "rgba8unorm");
    const baseProject = project();

    face.renderFrame(frame(baseProject));
    hair.renderFrame(frame(baseProject));
    face.renderFrame(frame(baseProject));
    hair.renderFrame(frame(baseProject));
    expect(readRenderDiagnostics().tpsSolves).toBe(4);

    const changed = {
      ...baseProject,
      features: [...baseProject.features],
    };
    face.renderFrame(frame(changed));
    hair.renderFrame(frame(baseProject));
    expect(readRenderDiagnostics().tpsSolves).toBe(6);

    face.dispose();
    hair.dispose();
  });

  it("rebuilds and uploads mesh geometry only after feature mutation", () => {
    const device = fakeDevice();
    const backend = new MeshBackend(device, "rgba8unorm");
    const baseProject = project();

    backend.renderFrame(frame(baseProject));
    backend.renderFrame(frame(baseProject));
    expect(readRenderDiagnostics()).toMatchObject({
      meshGeometryRebuilds: 1,
      meshGeometryUploads: 1,
    });

    backend.renderFrame(
      frame({ ...baseProject, features: [...baseProject.features] }),
    );
    expect(readRenderDiagnostics()).toMatchObject({
      meshGeometryRebuilds: 2,
      meshGeometryUploads: 2,
    });
    backend.dispose();
  });

  it("does not allocate new mesh buffers or textures over 120 stable frames", () => {
    const device = fakeDevice();
    const backend = new MeshBackend(device, "rgba8unorm");
    const stableFrame = frame(project());
    backend.renderFrame(stableFrame);
    const buffers = device.createBuffer.mock.calls.length;
    const textures = device.createTexture.mock.calls.length;

    for (let index = 0; index < 120; index++) backend.renderFrame(stableFrame);

    expect(device.createBuffer).toHaveBeenCalledTimes(buffers);
    expect(device.createTexture).toHaveBeenCalledTimes(textures);
    backend.dispose();
  });

  it("uploads Beier geometry only when its feature set changes", () => {
    const device = fakeDevice();
    const backend = new BeierBackend(device, "rgba8unorm");
    const baseProject = project();
    baseProject.features = [
      createSegmentFeature(
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.2, y: 0.3 },
        { x: 0.8, y: 0.3 },
      ),
    ];

    backend.renderFrame(frame(baseProject));
    backend.renderFrame(frame(baseProject));
    expect(readRenderDiagnostics().beierGeometryUploads).toBe(1);

    backend.renderFrame(
      frame({ ...baseProject, features: [...baseProject.features] }),
    );
    expect(readRenderDiagnostics().beierGeometryUploads).toBe(2);
    backend.dispose();
  });
});
