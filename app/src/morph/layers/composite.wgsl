// Multi-layer compositor. It reads the accumulated image, the current rendered
// layer and the optional masks — the rasterized vector region (canvas UV) and
// the brush-painted mask (project space) — then writes the next accumulation
// buffer. The two masks combine with max, so region and brush coexist on the
// same layer (PRD M11 lot 3).

struct Composite {
  projBox : vec4f, // x0, y0, w, h in canvas UV
  params  : vec4f, // opacity, mode, maskFlags (1 vector | 2 painted | 4 advected), invertMask
};

@group(0) @binding(0) var baseTex  : texture_2d<f32>;
@group(0) @binding(1) var layerTex : texture_2d<f32>;
@group(0) @binding(2) var maskTex  : texture_2d<f32>;
@group(0) @binding(3) var samp     : sampler;
@group(0) @binding(4) var<uniform> u : Composite;
@group(0) @binding(5) var paintTex : texture_2d<f32>;
// A-side warp map (Project Space source position per canvas pixel), rendered by
// the layer's backend. Flag bit 4 advects the painted mask through it, so paint
// authored over the un-warped source image follows the morph.
@group(0) @binding(6) var warpTex  : texture_2d<f32>;

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

fn insideProject(uv : vec2f) -> bool {
  let minUv = u.projBox.xy;
  let maxUv = u.projBox.xy + u.projBox.zw;
  return uv.x >= minUv.x && uv.x <= maxUv.x && uv.y >= minUv.y && uv.y <= maxUv.y;
}

// Combined mask value at a canvas UV: vector mask sampled as-is, painted mask
// sampled in project space, max of both, then the optional invert.
fn maskValue(uv : vec2f) -> f32 {
  let flags = u32(round(u.params.z));
  var value = 1.0;
  if ((flags & 1u) != 0u) {
    value = textureSampleLevel(maskTex, samp, uv, 0.0).r;
  }
  if ((flags & 2u) != 0u) {
    var projUv = clamp((uv - u.projBox.xy) / u.projBox.zw, vec2f(0.0), vec2f(1.0));
    if ((flags & 4u) != 0u) {
      projUv = clamp(
        textureSampleLevel(warpTex, samp, uv, 0.0).xy,
        vec2f(0.0),
        vec2f(1.0),
      );
    }
    let paint = textureSampleLevel(paintTex, samp, projUv, 0.0).r;
    value = select(paint, max(value, paint), (flags & 1u) != 0u);
  }
  if (flags != 0u && u.params.w > 0.5) {
    value = 1.0 - value;
  }
  return clamp(value, 0.0, 1.0);
}

fn unpremultiply(rgb : vec3f, alpha : f32) -> vec3f {
  if (alpha <= 0.000001) {
    return vec3f(0.0);
  }
  return rgb / alpha;
}

fn blendColor(dst : vec3f, src : vec3f, mode : i32) -> vec3f {
  if (mode == 2) {
    return dst * src;
  }
  if (mode == 3) {
    return vec3f(1.0) - (vec3f(1.0) - dst) * (vec3f(1.0) - src);
  }
  return src;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4f {
  let dst = textureSampleLevel(baseTex, samp, in.uv, 0.0);
  let src = textureSampleLevel(layerTex, samp, in.uv, 0.0);
  let mode = i32(round(u.params.y));

  if (mode == 6) {
    if (!insideProject(in.uv)) {
      return vec4f(0.0);
    }
    return vec4f(vec3f(maskValue(in.uv)), 1.0);
  }

  if (mode == 7) {
    if (!insideProject(in.uv)) {
      return dst;
    }
    let tint = vec3f(0.14, 0.72, 1.0);
    let tintAlpha = maskValue(in.uv) * 0.36;
    return vec4f(
      tint * tintAlpha + dst.rgb * (1.0 - tintAlpha),
      tintAlpha + dst.a * (1.0 - tintAlpha),
    );
  }

  var layerAmount = clamp(u.params.x, 0.0, 1.0);
  if (!insideProject(in.uv)) {
    layerAmount = 0.0;
  }
  layerAmount = layerAmount * maskValue(in.uv);

  let srcAlpha = src.a * layerAmount;
  let srcPremul = src.rgb * layerAmount;

  // Plus-lighter is defined directly on premultiplied components.
  if (mode == 4) {
    return vec4f(
      min(dst.rgb + srcPremul, vec3f(1.0)),
      min(dst.a + srcAlpha, 1.0),
    );
  }

  let dstColor = unpremultiply(dst.rgb, dst.a);
  let srcColor = unpremultiply(src.rgb, src.a);
  let blended = blendColor(dstColor, srcColor, mode);
  let outRgb =
    (1.0 - srcAlpha) * dst.rgb +
    (1.0 - dst.a) * srcPremul +
    srcAlpha * dst.a * blended;
  let outAlpha = srcAlpha + dst.a * (1.0 - srcAlpha);
  return vec4f(outRgb, outAlpha);
}
