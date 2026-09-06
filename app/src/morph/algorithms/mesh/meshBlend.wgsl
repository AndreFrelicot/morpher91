// Mesh blend pass (PRD §10.3): cross-dissolve the two warped images (both now
// in the same intermediate shape) into the canvas. Fullscreen triangle.

struct Blend {
  params : vec4f, // x = dissolveT
};

@group(0) @binding(0) var texA : texture_2d<f32>; // image A warped to shape(t)
@group(0) @binding(1) var texB : texture_2d<f32>; // image B warped to shape(t)
@group(0) @binding(2) var samp : sampler;
@group(0) @binding(3) var<uniform> u : Blend;

struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VsOut {
  var corners = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let xy = corners[vi];
  var out : VsOut;
  out.pos = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  let ca = textureSampleLevel(texA, samp, in.uv, 0.0);
  let cb = textureSampleLevel(texB, samp, in.uv, 0.0);
  return mix(ca, cb, u.params.x);
}
