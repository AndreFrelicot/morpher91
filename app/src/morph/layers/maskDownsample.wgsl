@group(0) @binding(0) var sourceTex : texture_2d<f32>;
@group(0) @binding(1) var sourceSampler : sampler;

struct VsOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex : u32) -> VsOut {
  var corners = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let xy = corners[vertexIndex];
  var out : VsOut;
  out.position = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  let coverage = textureSampleLevel(sourceTex, sourceSampler, in.uv, 0.0).r;
  return vec4f(coverage, 0.0, 0.0, 1.0);
}
