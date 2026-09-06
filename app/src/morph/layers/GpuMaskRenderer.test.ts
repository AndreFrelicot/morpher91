import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createProject,
  createRegionFeature,
  defaultPlacement,
} from "@/morph/model";
import {
  featherPassPlan,
  GpuMaskRenderer,
  MAX_BLUR_RADIUS,
} from "./GpuMaskRenderer";
import { MaskTextureCache } from "./MaskTextureCache";

function deviceHarness() {
  const textures: Array<{
    descriptor: GPUTextureDescriptor;
    view: GPUTextureView;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const buffers: Array<{
    descriptor: GPUBufferDescriptor;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };
  const beginRenderPass = vi.fn(() => pass);
  const createTexture = vi.fn((descriptor: GPUTextureDescriptor) => {
    const entry = {
      descriptor,
      view: {} as GPUTextureView,
      destroy: vi.fn(),
    };
    textures.push(entry);
    return {
      createView: vi.fn(() => entry.view),
      destroy: entry.destroy,
    };
  });
  const createBuffer = vi.fn((descriptor: GPUBufferDescriptor) => {
    const buffer = { descriptor, destroy: vi.fn() };
    buffers.push(buffer);
    return buffer;
  });
  const queue = {
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  const getBindGroupLayout = vi.fn(() => ({}));
  const device = {
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout })),
    createSampler: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createTexture,
    createBuffer,
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass,
      finish: vi.fn(() => ({})),
    })),
    queue,
  } as unknown as GPUDevice;
  return { device, textures, buffers, pass, beginRenderPass, queue };
}

function projectAndRegion() {
  const image = {
    id: "image",
    name: "image",
    width: 100,
    height: 100,
    source: { kind: "bundled" as const, value: "image" },
    placement: defaultPlacement(),
  };
  return {
    project: createProject(image, { ...image, id: "image-b" }),
    region: createRegionFeature([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ]),
  };
}

describe("GpuMaskRenderer", () => {
  it("renders a hard mask into a resolved scalar texture", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();

    const view = renderer.renderHard({
      project,
      region,
      t: 0.5,
      width: 320,
      height: 240,
    });

    expect(view).toBe(harness.textures[0].view);
    expect(harness.textures.map((entry) => entry.descriptor)).toEqual([
      expect.objectContaining({
        format: "r8unorm",
        sampleCount: 1,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }),
      expect.objectContaining({
        format: "r8unorm",
        sampleCount: 4,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      }),
    ]);
    expect(harness.beginRenderPass).toHaveBeenCalledWith({
      colorAttachments: [
        expect.objectContaining({
          view: harness.textures[1].view,
          resolveTarget: harness.textures[0].view,
          loadOp: "clear",
          storeOp: "discard",
        }),
      ],
    });
    expect(harness.pass.draw).toHaveBeenCalledWith(3);
    expect(harness.queue.writeBuffer).toHaveBeenCalledOnce();
    expect(harness.queue.submit).toHaveBeenCalledOnce();
  });

  it("reuses targets and buffers until the viewport grows", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();
    const render = (width: number) =>
      renderer.renderHard({
        project,
        region,
        t: 0,
        width,
        height: 240,
      });

    render(320);
    render(320);
    expect(harness.textures).toHaveLength(2);
    expect(harness.buffers).toHaveLength(3);

    render(640);
    expect(harness.textures).toHaveLength(4);
    expect(harness.textures[0].destroy).toHaveBeenCalledOnce();
    expect(harness.textures[1].destroy).toHaveBeenCalledOnce();

    renderer.dispose();
    expect(harness.textures[2].destroy).toHaveBeenCalledOnce();
    expect(harness.textures[3].destroy).toHaveBeenCalledOnce();
    expect(
      harness.buffers.every((buffer) => buffer.destroy.mock.calls.length === 1),
    ).toBe(true);
  });

  it("uses the shared smooth contour before triangulation", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();
    region.smooth = true;

    renderer.renderHard({
      project,
      region,
      t: 0,
      width: 320,
      height: 240,
    });

    const vertices = harness.queue.writeBuffer.mock.calls[0][2] as Float32Array;
    expect(vertices.length).toBeGreaterThan(region.a.length * 2);
  });

  it("interpolates region geometry at the layer morph time", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();
    region.b = region.a.map((point) => ({ x: point.x + 0.05, y: point.y }));

    renderer.renderHard({
      project,
      region,
      t: 0,
      width: 100,
      height: 100,
    });
    renderer.renderHard({
      project,
      region,
      t: 1,
      width: 100,
      height: 100,
    });

    const atA = harness.queue.writeBuffer.mock.calls[0][2] as Float32Array;
    const atB = harness.queue.writeBuffer.mock.calls[1][2] as Float32Array;
    for (let index = 0; index < atA.length; index += 2) {
      expect(atB[index] - atA[index]).toBeCloseTo(0.1, 5);
      expect(atB[index + 1]).toBeCloseTo(atA[index + 1], 5);
    }
  });

  it("maps the project content rect into canvas clip space", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();
    region.a = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    region.b = region.a;

    renderer.renderHard({
      project,
      region,
      t: 0,
      width: 100,
      height: 100,
      contentRect: { x: 25, y: 25, width: 50, height: 50 },
    });

    const vertices = harness.queue.writeBuffer.mock.calls[0][2] as Float32Array;
    const pairs = Array.from({ length: vertices.length / 2 }, (_, index) => [
      vertices[index * 2],
      vertices[index * 2 + 1],
    ]);
    expect(pairs).toContainEqual([-0.5, 0.5]);
    expect(pairs).toContainEqual([0.5, 0.5]);
    expect(pairs).toContainEqual([-0.5, -0.5]);
  });

  it("triangulates a concave region before drawing", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();
    region.a = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    region.b = region.a;

    renderer.renderHard({
      project,
      region,
      t: 0,
      width: 320,
      height: 240,
    });

    expect(harness.pass.draw).toHaveBeenCalledWith(9);
  });

  it("does not allocate resources for an invalid region", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();
    region.a = region.a.slice(0, 2);
    region.b = region.b.slice(0, 2);

    expect(
      renderer.renderHard({
        project,
        region,
        t: 0,
        width: 320,
        height: 240,
      }),
    ).toBeNull();
    expect(harness.textures).toHaveLength(0);
    expect(harness.buffers).toHaveLength(2);
  });

  it("downsamples large feathers then records two blur passes", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();

    const view = renderer.renderFeathered({
      project,
      region,
      t: 0.5,
      width: 320,
      height: 240,
      feather: 0.25,
    });

    const plan = featherPassPlan(60, 320, 240);
    expect(plan.levels.length).toBeGreaterThan(0);
    expect(view).toBe(harness.textures[harness.textures.length - 1].view);
    expect(harness.queue.writeBuffer).toHaveBeenCalledTimes(3);
    expect(harness.pass.draw).toHaveBeenCalledTimes(1 + plan.levels.length + 2);
    expect(harness.device.createBindGroup).toHaveBeenCalledTimes(
      plan.levels.length + 2,
    );
  });

  it("keeps a zero feather on the hard render path", () => {
    const harness = deviceHarness();
    const renderer = new GpuMaskRenderer(harness.device);
    const { project, region } = projectAndRegion();

    const view = renderer.renderFeathered({
      project,
      region,
      t: 0,
      width: 320,
      height: 240,
      feather: 0,
    });

    expect(view).toBe(harness.textures[0].view);
    expect(harness.queue.submit).toHaveBeenCalledOnce();
    expect(harness.device.createBindGroup).not.toHaveBeenCalled();
  });
});

describe("featherPassPlan", () => {
  it("keeps subpixel feather on the hard path", () => {
    expect(featherPassPlan(0.5, 320, 240)).toEqual({
      levels: [],
      sigma: 0,
      kernelRadius: 0,
    });
  });

  it("bounds the blur kernel for large portrait and landscape surfaces", () => {
    for (const [width, height] of [
      [1536, 1024],
      [1024, 1536],
      [320, 240],
    ]) {
      const plan = featherPassPlan(Math.min(width, height), width, height);
      expect(plan.kernelRadius).toBeGreaterThan(0);
      expect(plan.kernelRadius).toBeLessThanOrEqual(MAX_BLUR_RADIUS);
      expect(plan.levels[plan.levels.length - 1]).toEqual(
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      );
    }
  });
});

describe("MaskTextureCache", () => {
  it("creates a scalar white fallback without a CPU vector target", () => {
    const harness = deviceHarness();
    const cache = new MaskTextureCache(harness.device);

    expect(harness.textures).toHaveLength(1);
    expect(harness.textures[0].descriptor).toEqual(
      expect.objectContaining({
        size: [1, 1],
        format: "r8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      }),
    );
    expect(harness.queue.writeTexture).toHaveBeenCalledWith(
      { texture: expect.any(Object) },
      new Uint8Array([255]),
      {},
      [1, 1],
    );

    cache.beginFrame(projectAndRegion().project);
    expect(harness.textures).toHaveLength(1);
    cache.dispose();
    expect(harness.textures[0].destroy).toHaveBeenCalledOnce();
  });
});

beforeAll(() => {
  vi.stubGlobal("GPUBufferUsage", { VERTEX: 1, COPY_DST: 2, UNIFORM: 4 });
  vi.stubGlobal("GPUTextureUsage", {
    RENDER_ATTACHMENT: 1,
    TEXTURE_BINDING: 2,
    COPY_DST: 4,
  });
});
