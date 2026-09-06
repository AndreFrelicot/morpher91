// Final presentation pass. Renderer intermediates contain premultiplied RGBA;
// this pass either preserves it or flattens it onto an opaque black/white base.

struct Present {
  background : vec4f, // rgb = background, a = 0 preserve alpha | 1 flatten
};

@group(0) @binding(0) var source : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var<uniform> u : Present;

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
  let src = textureSampleLevel(source, samp, in.uv, 0.0);
  if (u.background.a < 0.5) {
    return src;
  }
  return vec4f(src.rgb + u.background.rgb * (1.0 - src.a), 1.0);
}
