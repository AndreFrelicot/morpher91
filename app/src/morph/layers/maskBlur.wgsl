const MAX_BLUR_RADIUS : i32 = 16;

struct BlurParams {
  directionSigmaRadius : vec4f, // texel dx, texel dy, sigma, kernel radius
};

@group(0) @binding(0) var sourceTex : texture_2d<f32>;
@group(0) @binding(1) var sourceSampler : sampler;
@group(0) @binding(2) var<uniform> params : BlurParams;

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
  let direction = params.directionSigmaRadius.xy;
  let sigma = max(params.directionSigmaRadius.z, 0.5);
  let radius = min(
    i32(round(params.directionSigmaRadius.w)),
    MAX_BLUR_RADIUS,
  );
  let denominator = 2.0 * sigma * sigma;
  var weighted = 0.0;
  var totalWeight = 0.0;

  for (var tap = -MAX_BLUR_RADIUS; tap <= MAX_BLUR_RADIUS; tap += 1) {
    if (abs(tap) <= radius) {
      let distance = f32(tap);
      let weight = exp(-(distance * distance) / denominator);
      let uv = clamp(
        in.uv + direction * distance,
        vec2f(0.0),
        vec2f(1.0),
      );
      weighted += textureSampleLevel(sourceTex, sourceSampler, uv, 0.0).r * weight;
      totalWeight += weight;
    }
  }

  let coverage = weighted / max(totalWeight, 0.000001);
  return vec4f(coverage, 0.0, 0.0, 1.0);
}
