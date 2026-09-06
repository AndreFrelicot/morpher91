// GPU interaction overlay (PRD M11). One module, three pipelines sharing the
// `Frame` uniform: solid polygon fills, instanced SDF capsule lines, instanced
// SDF dots. Positions arrive in project space (0..1); the content box (CSS px,
// after zoom+pan) and canvas size map them to clip space, so pixel sizes stay
// constant on screen at any zoom. Output is premultiplied (alphaMode
// "premultiplied"): rgb already scaled by alpha, transparent where uncovered.

struct Frame {
  content  : vec4f, // x, y, w, h of the project content box, in CSS px
  viewport : vec4f, // xy = canvas size in CSS px
};

@group(0) @binding(0) var<uniform> u : Frame;

fn proj_to_css(p : vec2f) -> vec2f {
  return u.content.xy + p * u.content.zw;
}

fn css_to_clip(c : vec2f) -> vec4f {
  return vec4f(c.x / u.viewport.x * 2.0 - 1.0, 1.0 - c.y / u.viewport.y * 2.0, 0.0, 1.0);
}

// Unit quad as two triangles, corners in [0,1]².
fn quad_corner(vi : u32) -> vec2f {
  var c = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  return c[vi];
}

fn premultiply(rgb : vec3f, a : f32) -> vec4f {
  return vec4f(rgb * a, a);
}

// ---------------------------------------------------------------- fills ------

struct FillIn {
  @location(0) pos   : vec2f, // project space
  @location(1) color : vec4f, // straight rgba
};

struct FillOut {
  @builtin(position) pos : vec4f,
  @location(0) color : vec4f,
};

@vertex
fn vs_fill(in : FillIn) -> FillOut {
  var out : FillOut;
  out.pos = css_to_clip(proj_to_css(in.pos));
  out.color = in.color;
  return out;
}

@fragment
fn fs_fill(in : FillOut) -> @location(0) vec4f {
  return premultiply(in.color.rgb, in.color.a);
}

// ---------------------------------------------------------------- lines ------

struct LineIn {
  @builtin(vertex_index) vi : u32,
  @location(0) a     : vec2f, // project space
  @location(1) b     : vec2f, // project space
  @location(2) color : vec4f, // straight rgba
  @location(3) width : f32, // screen px
};

struct LineOut {
  @builtin(position) pos : vec4f,
  @location(0) color  : vec4f,
  @location(1) along  : f32, // px from endpoint A along the segment
  @location(2) across : f32, // signed px across the segment
  @location(3) shape  : vec2f, // len, halfWidth
};

const AA : f32 = 1.0;

@vertex
fn vs_line(in : LineIn) -> LineOut {
  let pa = proj_to_css(in.a);
  let pb = proj_to_css(in.b);
  let delta = pb - pa;
  let len = length(delta);
  let dir = select(vec2f(1.0, 0.0), delta / len, len > 1e-6);
  let nrm = vec2f(-dir.y, dir.x);

  let half = in.width * 0.5;
  // Butt caps (SVG default): extend across by the AA band, and only ~1px along
  // each end for end AA — NOT by the half-width. Round caps would double-composite
  // at polyline/grid joints and bead every sample point on translucent grids.
  let extAcross = half + AA;

  let corner = quad_corner(in.vi);
  let along = mix(-AA, len + AA, corner.x);
  let across = mix(-extAcross, extAcross, corner.y);
  let css = pa + dir * along + nrm * across;

  var out : LineOut;
  out.pos = css_to_clip(css);
  out.color = in.color;
  out.along = along;
  out.across = across;
  out.shape = vec2f(len, half);
  return out;
}

@fragment
fn fs_line(in : LineOut) -> @location(0) vec4f {
  let len = in.shape.x;
  let half = in.shape.y;

  // Separable butt-cap coverage: AA across the width, AA over ~1px at each end.
  let covAcross = 1.0 - smoothstep(half - 0.5, half + 0.5, abs(in.across));
  let covAlong = clamp(min(in.along + 0.5, len - in.along + 0.5), 0.0, 1.0);
  let cov = covAcross * covAlong;

  let a = in.color.a * cov;
  return premultiply(in.color.rgb, a);
}

// ----------------------------------------------------------------- dots ------

struct DotIn {
  @builtin(vertex_index) vi : u32,
  @location(0) pos    : vec2f, // project space
  @location(1) fill   : vec4f, // straight rgba
  @location(2) stroke : vec4f, // straight rgba
  @location(3) params : vec4f, // radiusPx, strokeWidthPx, _, _
};

struct DotOut {
  @builtin(position) pos : vec4f,
  @location(0) fill   : vec4f,
  @location(1) stroke : vec4f,
  @location(2) local  : vec2f, // px from centre
  @location(3) radii  : vec2f, // radiusPx, strokeWidthPx
};

@vertex
fn vs_dot(in : DotIn) -> DotOut {
  let radius = in.params.x;
  let strokeW = in.params.y;
  let ext = radius + strokeW + AA;

  let centre = proj_to_css(in.pos);
  let local = (quad_corner(in.vi) * 2.0 - vec2f(1.0)) * ext;

  var out : DotOut;
  out.pos = css_to_clip(centre + local);
  out.fill = in.fill;
  out.stroke = in.stroke;
  out.local = local;
  out.radii = vec2f(radius, strokeW);
  return out;
}

@fragment
fn fs_dot(in : DotOut) -> @location(0) vec4f {
  let radius = in.radii.x;
  let half = in.radii.y * 0.5;
  let dist = length(in.local);

  let rOuter = radius + half;
  let rInner = max(0.0, radius - half);

  let diskCov = 1.0 - smoothstep(rOuter - 0.75, rOuter + 0.75, dist);
  let strokeMix = smoothstep(rInner - 0.75, rInner + 0.75, dist);

  let rgb = mix(in.fill.rgb, in.stroke.rgb, strokeMix);
  let a = mix(in.fill.a, in.stroke.a, strokeMix) * diskCov;
  return premultiply(rgb, a);
}
