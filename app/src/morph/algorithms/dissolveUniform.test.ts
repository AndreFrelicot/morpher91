import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createProject,
  defaultPlacement,
  type ImageAsset,
  type MorphAlgorithmId,
} from "@/morph/model";
import { createBackend } from "./backendFactory";
import type { MorphFrame } from "./MorphBackend";

/**
 * Layer transition windows (PRD §9.2) drive the warp with `t` and the crossfade
 * with `dissolveT`. Each backend must carry `dissolveT` into the uniform its
 * shader mixes A and B with.
 */

type Write = { size: number; data: Float32Array };

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

function stubDevice(writes: Write[]): GPUDevice {
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  };
  return {
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => ({
      size: descriptor.size,
      destroy: vi.fn(),
    })),
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
      writeBuffer: vi.fn(
        (buffer: { size: number }, _offset: number, data: Float32Array) => {
          writes.push({ size: buffer.size, data: Float32Array.from(data) });
        },
      ),
      writeTexture: vi.fn(),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;
}

/** Renders one frame with warpT = 0.8 and dissolveT = 0.25 and returns the uniform writes. */
function renderWindowedFrame(algorithm: MorphAlgorithmId): Write[] {
  const writes: Write[] = [];
  const view = {} as GPUTextureView;
  const backend = createBackend(algorithm, stubDevice(writes), "rgba8unorm");
  const frame: MorphFrame = {
    project: createProject(image("a"), image("b")),
    target: view,
    a: { view, width: 512, height: 512 },
    b: { view, width: 512, height: 512 },
    canvasWidth: 512,
    canvasHeight: 512,
    t: 0.8,
    dissolveT: 0.25,
  };
  backend.renderFrame(frame);
  backend.dispose();
  return writes;
}

describe("dissolveT uniforms", () => {
  it("crossfade blends on dissolveT (crossfade.wgsl params.x)", () => {
    const [uniforms] = renderWindowedFrame("crossfade");
    expect(uniforms.data[12]).toBeCloseTo(0.25);
  });

  it("mesh warps on t and blends on dissolveT (meshBlend.wgsl params.x)", () => {
    const writes = renderWindowedFrame("mesh");
    const warps = writes.filter((write) => write.data.length === 8);
    const blend = writes.find((write) => write.data.length === 4);
    expect(warps.length).toBeGreaterThan(0);
    for (const warp of warps) expect(warp.data[4]).toBeCloseTo(0.8);
    expect(blend?.data[0]).toBeCloseTo(0.25);
  });

  it("tps blends on dissolveT (tpsWarp.wgsl params.x)", () => {
    // The frame uniforms are the last 16-float write (the affines come first).
    const uniforms = renderWindowedFrame("thin-plate-spline")
      .filter((write) => write.data.length === 16)
      .pop();
    expect(uniforms?.data[12]).toBeCloseTo(0.25);
  });

  it("beier warps on t and blends on dissolveT (beierNeely.wgsl params.z)", () => {
    const uniforms = renderWindowedFrame("beier-neely").find(
      (write) => write.data.length === 20,
    );
    expect(uniforms?.data[12]).toBeCloseTo(0.8);
    expect(uniforms?.data[14]).toBeCloseTo(0.25);
  });

  it("falls back to t when no dissolve window narrows the crossfade", () => {
    const writes: Write[] = [];
    const view = {} as GPUTextureView;
    const backend = createBackend(
      "crossfade",
      stubDevice(writes),
      "rgba8unorm",
    );
    backend.renderFrame({
      project: createProject(image("a"), image("b")),
      target: view,
      a: { view, width: 512, height: 512 },
      b: { view, width: 512, height: 512 },
      canvasWidth: 512,
      canvasHeight: 512,
      t: 0.8,
    });
    backend.dispose();

    expect(writes[0].data[12]).toBeCloseTo(0.8);
  });
});

beforeAll(() => {
  vi.stubGlobal("GPUBufferUsage", {
    UNIFORM: 1,
    COPY_DST: 2,
    STORAGE: 4,
    VERTEX: 8,
    INDEX: 16,
  });
  vi.stubGlobal("GPUTextureUsage", {
    RENDER_ATTACHMENT: 1,
    TEXTURE_BINDING: 2,
  });
});
