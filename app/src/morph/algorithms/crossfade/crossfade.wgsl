// Crossfade baseline (PRD §10.2): no warp, linear blend of two placed images.
// Fullscreen-triangle render pass writing straight to the canvas.

struct Uniforms {
  aScaleOffset : vec4f, // scaleX, scaleY, offsetX, offsetY for image A
  bScaleOffset : vec4f, // same for image B
  projBox      : vec4f, // x0, y0, w, h : project content box in canvas UV
  params       : vec4f, // x = t (dissolve), yzw unused
};

@group(0) @binding(0) var imageA : texture_2d<f32>;
@group(0) @binding(1) var imageB : texture_2d<f32>;
@group(0) @binding(2) var samp   : sampler;
@group(0) @binding(3) var<uniform> u : Uniforms;

struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VsOut {
  // Oversized triangle covering the viewport.
  var corners = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let xy = corners[vi];
  var out : VsOut;
  out.pos = vec4f(xy, 0.0, 1.0);
  // Canvas UV with top-left origin (flip Y from clip space).
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

fn samplePlaced(
  tex : texture_2d<f32>,
  s : sampler,
  uv : vec2f,
  scaleOffset : vec4f,
) -> vec4f {
  let iuv = uv * scaleOffset.xy + scaleOffset.zw;
  if (iuv.x < 0.0 || iuv.x > 1.0 || iuv.y < 0.0 || iuv.y > 1.0) {
    return vec4f(0.0); // transparent letterbox in the internal render target
  }
  // textureSampleLevel (explicit LOD, no derivatives) is allowed in the
  // non-uniform control flow created by the bounds check above.
  return textureSampleLevel(tex, s, iuv, 0.0);
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  let p = (in.uv - u.projBox.xy) / u.projBox.zw;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
    return vec4f(0.0);
  }

  let ca = samplePlaced(imageA, samp, p, u.aScaleOffset);
  let cb = samplePlaced(imageB, samp, p, u.bScaleOffset);
  return mix(ca, cb, u.params.x);
}

// Warp map (painted-mask advection): the A-side source position of each output
// pixel, in Project Space. Crossfade never warps, so the map is the identity.
@fragment
fn fs_warp(in : VsOut) -> @location(0) vec4f {
  let p = (in.uv - u.projBox.xy) / u.projBox.zw;
  return vec4f(p, 0.0, 1.0);
}
