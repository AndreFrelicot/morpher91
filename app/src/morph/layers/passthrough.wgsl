// Draws one shared source/target texture into a side pane (PRD M10). The pane
// honours the shared viewport zoom/pan, so the placement is passed in as canvas
// UV rects: `imageRect` is where the (aspect-preserved) frame goes, `contentRect`
// is the project content box (a dark letterbox fills the gap). Output is
// premultiplied: transparent outside the content box so the app background shows.

struct Params {
  imageRect   : vec4f, // x, y, w, h in canvas UV
  contentRect : vec4f, // x, y, w, h in canvas UV
};

@group(0) @binding(0) var tex  : texture_2d<f32>;
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

fn inside(uv : vec2f, rect : vec4f) -> bool {
  return uv.x >= rect.x && uv.x <= rect.x + rect.z &&
         uv.y >= rect.y && uv.y <= rect.y + rect.w;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  if (inside(in.uv, u.imageRect)) {
    let texUv = (in.uv - u.imageRect.xy) / u.imageRect.zw;
    return textureSampleLevel(tex, samp, texUv, 0.0);
  }
  if (inside(in.uv, u.contentRect)) {
    return vec4f(0.0, 0.0, 0.0, 0.35);
  }
  return vec4f(0.0, 0.0, 0.0, 0.0);
}
