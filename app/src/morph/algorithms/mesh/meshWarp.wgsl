// Mesh warp pass (PRD §10.3, Option A). Rasterizes the triangulated mesh at the
// intermediate shape positionT = mix(positionA, positionB, t), sampling one
// image at its own UVs — this forward-warps that image into the shape at t.
// Run once per image into an intermediate texture, then blended (meshBlend).

struct Warp {
  projToClip : vec4f, // sx, sy, ox, oy : clip = projectPos * scale + offset
  params     : vec4f, // x = t, y = side (0 = use uvA, 1 = use uvB)
};

@group(0) @binding(0) var img  : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var<uniform> u : Warp;

struct VsIn {
  @location(0) posA : vec2f, // image A position, Project Space [0,1]
  @location(1) posB : vec2f, // image B position
  @location(2) uvA  : vec2f, // sampling UV for image A
  @location(3) uvB  : vec2f, // sampling UV for image B
};

struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(in : VsIn) -> VsOut {
  let p = mix(in.posA, in.posB, u.params.x);
  var out : VsOut;
  // Project Space [0,1] → clip space (Y flipped, project letterboxed in canvas).
  out.pos = vec4f(p * u.projToClip.xy + u.projToClip.zw, 0.0, 1.0);
  out.uv = select(in.uvA, in.uvB, u.params.y > 0.5);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  if (in.uv.x < 0.0 || in.uv.x > 1.0 || in.uv.y < 0.0 || in.uv.y > 1.0) {
    return vec4f(0.0); // transparent letterbox in the internal render target
  }
  // Explicit LOD (no derivatives) is allowed in this non-uniform control flow.
  return textureSampleLevel(img, samp, in.uv, 0.0);
}

// Warp-map pass (painted-mask advection): rasterizes the same mesh at shape(t)
// but outputs the interpolated image-A Project Space position of each pixel —
// the barycentric interpolation of posA — instead of a color.
struct VsMapOut {
  @builtin(position) pos : vec4f,
  @location(0) posA : vec2f,
};

@vertex
fn vs_map(in : VsIn) -> VsMapOut {
  let p = mix(in.posA, in.posB, u.params.x);
  var out : VsMapOut;
  out.pos = vec4f(p * u.projToClip.xy + u.projToClip.zw, 0.0, 1.0);
  out.posA = in.posA;
  return out;
}

@fragment
fn fs_map(in : VsMapOut) -> @location(0) vec4f {
  return vec4f(in.posA, 0.0, 1.0);
}
