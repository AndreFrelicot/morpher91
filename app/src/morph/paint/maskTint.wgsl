// Pane preview of the painted layer mask (PRD M11 lot 3): draws the brush
// session's R8 mask as a translucent tint over the media viewport, mapped to
// the project content box (same canvas-UV rect convention as passthrough.wgsl).
// Output is premultiplied; transparent outside the content box.

struct Params {
  contentRect : vec4f, // x, y, w, h in canvas UV
  tint        : vec4f, // straight RGBA
};

@group(0) @binding(0) var maskTex : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var<uniform> u : Params;

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
  let local = (in.uv - u.contentRect.xy) / u.contentRect.zw;
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) {
    return vec4f(0.0);
  }
  let value = textureSampleLevel(maskTex, samp, local, 0.0).r;
  let alpha = value * u.tint.a;
  return vec4f(u.tint.rgb * alpha, alpha);
}
