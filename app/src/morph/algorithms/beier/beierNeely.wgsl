// Beier–Neely field morphing (PRD §10.5). Single fullscreen pass, backward
// warp: for each output pixel p (the intermediate shape at t, in Project Space)
// the control lines are interpolated to their position at t (mid = mix(A, B, t))
// and each pixel is mapped back onto image A and image B by the weighted sum of
// per-line mappings, then dissolved. Lines are uploaded once (BeierBackend) and
// only rebuilt when features/settings change; a/b/p/t live in the uniforms.

struct MorphLine {
  a      : vec4f, // a0.xy, a1.xy
  b      : vec4f, // b0.xy, b1.xy
  params : vec4f, // weight, falloff (reserved), reserved, reserved
};

struct U {
  projBox : vec4f, // x0, y0, w, h : project content box in canvas UV (letterbox)
  uvA     : vec4f, // scaleX, scaleY, offsetX, offsetY : Project Space → image A UV
  uvB     : vec4f, // image B
  params  : vec4f, // x = warpT, y = line count, z = dissolveT
  coeffs  : vec4f, // x = a (softness), y = b (falloff exp), z = p (length influence)
};

@group(0) @binding(0) var imgA : texture_2d<f32>;
@group(0) @binding(1) var imgB : texture_2d<f32>;
@group(0) @binding(2) var samp : sampler;
@group(0) @binding(3) var<uniform> u : U;
@group(0) @binding(4) var<storage, read> lines : array<MorphLine>;

fn perp(v : vec2f) -> vec2f {
  return vec2f(-v.y, v.x);
}

// Maps x from the line frame (p,q) to the line frame (p2,q2) (PRD §10.5). The
// squared length is guarded so a zero-length intermediate line maps to p2
// instead of producing NaN (matches beierWarp.ts).
fn map_point_by_line_pair(x : vec2f, p : vec2f, q : vec2f, p2 : vec2f, q2 : vec2f) -> vec2f {
  let pq = q - p;
  let pqLen = max(length(pq), 0.000001);

  let uu = dot(x - p, pq) / (pqLen * pqLen);
  let vv = dot(x - p, perp(pq)) / pqLen;

  let p2q2 = q2 - p2;
  let p2q2Len = max(length(p2q2), 0.000001);

  return p2 + uu * p2q2 + (vv * perp(p2q2) / p2q2Len);
}

fn line_distance(x : vec2f, p : vec2f, q : vec2f) -> f32 {
  let pq = q - p;
  let len2 = dot(pq, pq);
  if (len2 < 0.000001) {
    return distance(x, p);
  }
  let uu = dot(x - p, pq) / len2;
  if (uu < 0.0) {
    return distance(x, p);
  }
  if (uu > 1.0) {
    return distance(x, q);
  }
  return distance(x, p + uu * pq);
}

// Evaluates both backward warps (intermediate→A and intermediate→B) in one
// shared loop: line interpolation, distance and weight are computed once.
// Returns srcA in .xy and srcB in .zw. (Storage is read directly rather than
// via pointer params, which need `unrestricted_pointer_parameters`.)
fn warp_both(x : vec2f, t : f32, count : u32) -> vec4f {
  var totalA = vec2f(0.0, 0.0);
  var totalB = vec2f(0.0, 0.0);
  var totalWeight = 0.0;

  for (var i = 0u; i < count; i = i + 1u) {
    let ln = lines[i];
    let a0 = ln.a.xy;
    let a1 = ln.a.zw;
    let b0 = ln.b.xy;
    let b1 = ln.b.zw;

    let m0 = mix(a0, b0, t);
    let m1 = mix(a1, b1, t);

    let dist = line_distance(x, m0, m1);
    let len = length(m1 - m0);
    let weight =
      pow(pow(len, u.coeffs.z) / (u.coeffs.x + dist), u.coeffs.y) * ln.params.x;

    let mappedA = map_point_by_line_pair(x, m0, m1, a0, a1);
    let mappedB = map_point_by_line_pair(x, m0, m1, b0, b1);

    totalA = totalA + (mappedA - x) * weight;
    totalB = totalB + (mappedB - x) * weight;
    totalWeight = totalWeight + weight;
  }

  if (totalWeight <= 0.000001) {
    return vec4f(x, x);
  }
  return vec4f(x + totalA / totalWeight, x + totalB / totalWeight);
}

fn sample_image(tex : texture_2d<f32>, uv : vec2f) -> vec4f {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(0.0); // transparent letterbox in the internal render target
  }
  return textureSampleLevel(tex, samp, uv, 0.0);
}

struct VsOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f, // canvas UV (0,0 = top-left)
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
  // Canvas UV → Project Space (undo the letterbox of the project in the canvas).
  let p = (in.uv - u.projBox.xy) / u.projBox.zw;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
    return vec4f(0.0);
  }

  var srcA = p;
  var srcB = p;
  let count = u32(u.params.y);
  if (count > 0u) {
    let src = warp_both(p, u.params.x, count);
    srcA = src.xy;
    srcB = src.zw;
  }

  let ca = sample_image(imgA, srcA * u.uvA.xy + u.uvA.zw);
  let cb = sample_image(imgB, srcB * u.uvB.xy + u.uvB.zw);
  return mix(ca, cb, u.params.z);
}

// Warp map (painted-mask advection): the A-side source position of each output
// pixel, in Project Space — the same coordinate image A is sampled at, so a
// mask authored over the un-warped A follows the morph.
@fragment
fn fs_warp(in : VsOut) -> @location(0) vec4f {
  let p = (in.uv - u.projBox.xy) / u.projBox.zw;
  var srcA = p;
  let count = u32(u.params.y);
  if (count > 0u && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {
    srcA = warp_both(p, u.params.x, count).xy;
  }
  return vec4f(srcA, 0.0, 1.0);
}
