// GPU mask brush (PRD M11 lot 3). Two passes over r8unorm textures in mask
// pixel space:
//
// - `vsStamp`/`fsStamp`: one instanced quad per stamp center, radial falloff
//   `(1 - smoothstep(radius*hardness, radius, dist)) * strength`. Rendered into
//   the stroke buffer with MAX blending, so overlapping stamps plateau at
//   `strength` instead of over-darkening where the pointer slows down.
// - `vsCombine`/`fsCombine`: full-screen compose of committed ∘ stroke — add
//   for paint, subtract for the eraser — written to the display/commit target.
//   Same-size textures, so plain textureLoad (no sampler).

struct StampParams {
  size     : vec2f, // mask texture size in px
  radius   : f32,   // stamp radius in px
  hardness : f32,   // 0 soft .. 1 hard
  strength : f32,   // deposited alpha
  _pad0    : f32,
  _pad1    : vec2f,
};

@group(0) @binding(0) var<uniform> stamp : StampParams;

struct StampOut {
  @builtin(position) pos : vec4f,
  @location(0) local : vec2f, // px offset from the stamp center
};

@vertex
fn vsStamp(
  @builtin(vertex_index) vi : u32,
  @location(0) center : vec2f,
) -> StampOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
  );
  let local = corners[vi] * stamp.radius;
  let p = center + local;
  var out : StampOut;
  out.pos = vec4f(
    p.x / stamp.size.x * 2.0 - 1.0,
    1.0 - p.y / stamp.size.y * 2.0,
    0.0,
    1.0,
  );
  out.local = local;
  return out;
}

@fragment
fn fsStamp(in : StampOut) -> @location(0) vec4f {
  let d = length(in.local);
  let inner = stamp.radius * clamp(stamp.hardness, 0.0, 1.0);
  let outer = max(stamp.radius, inner + 1e-3);
  let alpha = (1.0 - smoothstep(inner, outer, d)) * stamp.strength;
  return vec4f(alpha, 0.0, 0.0, 1.0);
}

struct CombineParams {
  params : vec4f, // x: 0 = paint (add), 1 = erase (subtract)
};

@group(0) @binding(0) var committedTex : texture_2d<f32>;
@group(0) @binding(1) var strokeTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> combine : CombineParams;

@vertex
fn vsCombine(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  return vec4f(corners[vi], 0.0, 1.0);
}

@fragment
fn fsCombine(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  let xy = vec2i(pos.xy);
  let base = textureLoad(committedTex, xy, 0).r;
  let s = textureLoad(strokeTex, xy, 0).r;
  let value = select(base + s, base - s, combine.params.x > 0.5);
  return vec4f(clamp(value, 0.0, 1.0), 0.0, 0.0, 1.0);
}
