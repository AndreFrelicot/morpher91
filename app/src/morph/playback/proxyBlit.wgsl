// Downscale blit of a decoded VideoFrame (external texture) into a reduced
// rgba8 proxy texture (M23). Fullscreen triangle; the linear sampler at half
// scale averages 2×2 source texels, which is the whole point of doing the
// downscale on the GPU instead of through createImageBitmap.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VsOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  var out: VsOut;
  out.pos = vec4<f32>(pos[index], 0.0, 1.0);
  out.uv = vec2<f32>(pos[index].x * 0.5 + 0.5, 0.5 - pos[index].y * 0.5);
  return out;
}

@group(0) @binding(0) var frame: texture_external;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  return textureSampleBaseClampToEdge(frame, samp, in.uv);
}
