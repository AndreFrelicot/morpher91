// Thin-Plate Spline warp (PRD §10.4). Single fullscreen pass, backward warp:
// for each output pixel p (in the intermediate shape at t, expressed in Project
// Space) we evaluate the warps mid→A and mid→B to find where to sample each
// image, then dissolve. The warps are solved on the CPU per frame (TpsBackend)
// and uploaded as storage buffers; the source landmarks (mid) are shared.

struct TpsPoint { p : vec2f, _pad : vec2f, };   // 16-byte aligned
struct TpsCoeff { wx : f32, wy : f32, _p0 : f32, _p1 : f32, };
struct Affines {
  ax : vec4f, // mid→A : a0, ax, ay, _  (X component)
  ay : vec4f, // mid→A : Y component
  bx : vec4f, // mid→B : X component
  by : vec4f, // mid→B : Y component
};
struct U {
  projBox : vec4f, // x0, y0, w, h : project content box in canvas UV (letterbox)
  uvA     : vec4f, // scaleX, scaleY, offsetX, offsetY : Project Space → image A UV
  uvB     : vec4f, // image B
  params  : vec4f, // x = dissolveT, y = landmark count, z = valid (1/0)
};

@group(0) @binding(0) var imgA  : texture_2d<f32>;
@group(0) @binding(1) var imgB  : texture_2d<f32>;
@group(0) @binding(2) var samp  : sampler;
@group(0) @binding(3) var<uniform> u : U;
@group(0) @binding(4) var<storage, read> points  : array<TpsPoint>;
@group(0) @binding(5) var<storage, read> coeffsA : array<TpsCoeff>;
@group(0) @binding(6) var<storage, read> coeffsB : array<TpsCoeff>;
@group(0) @binding(7) var<uniform> aff : Affines;

fn tps_kernel(r : f32) -> f32 {
  if (r < 0.000001) { return 0.0; }
  return r * r * log(r);
}

// Evaluates both warps (mid→A and mid→B) in one loop. They share the source
// landmarks, so distance and kernel are computed once. Returns srcA in .xy and
// srcB in .zw. (Storage buffers are read directly rather than via pointer
// params, which need the optional `unrestricted_pointer_parameters` feature.)
fn eval_both(p : vec2f, count : u32) -> vec4f {
  var ax = aff.ax.x + aff.ax.y * p.x + aff.ax.z * p.y;
  var ay = aff.ay.x + aff.ay.y * p.x + aff.ay.z * p.y;
  var bx = aff.bx.x + aff.bx.y * p.x + aff.bx.z * p.y;
  var by = aff.by.x + aff.by.y * p.x + aff.by.z * p.y;
  for (var i = 0u; i < count; i = i + 1u) {
    let uK = tps_kernel(distance(p, points[i].p));
    let ca = coeffsA[i];
    let cb = coeffsB[i];
    ax = ax + ca.wx * uK;
    ay = ay + ca.wy * uK;
    bx = bx + cb.wx * uK;
    by = by + cb.wy * uK;
  }
  return vec4f(ax, ay, bx, by);
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
  if (u.params.z > 0.5) { // valid solve (enough landmarks)
    let src = eval_both(p, u32(u.params.y));
    srcA = src.xy;
    srcB = src.zw;
  }

  let ca = sample_image(imgA, srcA * u.uvA.xy + u.uvA.zw);
  let cb = sample_image(imgB, srcB * u.uvB.xy + u.uvB.zw);
  return mix(ca, cb, u.params.x);
}

// Warp map (painted-mask advection): the A-side source position (mid→A) of
// each output pixel, in Project Space — the same coordinate image A is
// sampled at, so a mask authored over the un-warped A follows the morph.
@fragment
fn fs_warp(in : VsOut) -> @location(0) vec4f {
  let p = (in.uv - u.projBox.xy) / u.projBox.zw;
  var srcA = p;
  if (u.params.z > 0.5 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {
    srcA = eval_both(p, u32(u.params.y)).xy;
  }
  return vec4f(srcA, 0.0, 1.0);
}
